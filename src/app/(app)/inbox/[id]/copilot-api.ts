import type { CopilotStateDto, CopilotSuggestionDto } from "@/modules/ai/dto";
import { HttpError } from "@/app/(app)/inbox/inbox-queries";

/**
 * Client of the Copilot API (`/api/conversations/[id]/copilot`). The UI only
 * ever sees `CopilotSuggestionDto`: no model, provider or prompt.
 */
export const copilotKeys = {
  conversation: (conversationId: string) => ["copilot", conversationId] as const,
};

/** An API error with the stable code and Spanish message the server sent. */
export class CopilotApiError extends HttpError {
  constructor(
    status: number,
    readonly code: string,
    readonly userMessage: string,
  ) {
    super(status);
  }
}

async function readState(response: Response): Promise<CopilotSuggestionDto | null> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new CopilotApiError(
      response.status,
      body?.error ?? "UNKNOWN",
      body?.message ?? "No se pudo completar la acción. Inténtalo de nuevo.",
    );
  }
  return ((await response.json()) as CopilotStateDto).suggestion;
}

export async function fetchSuggestion(conversationId: string): Promise<CopilotSuggestionDto | null> {
  return readState(await fetch(`/api/conversations/${conversationId}/copilot`, { cache: "no-store" }));
}

export async function generateSuggestion(conversationId: string): Promise<CopilotSuggestionDto | null> {
  return readState(await fetch(`/api/conversations/${conversationId}/copilot`, { method: "POST" }));
}

export async function resolveSuggestion(
  conversationId: string,
  suggestionId: string,
  action: "USED_AS_DRAFT" | "DISCARDED",
): Promise<CopilotSuggestionDto | null> {
  return readState(
    await fetch(`/api/conversations/${conversationId}/copilot/${suggestionId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }),
  );
}
