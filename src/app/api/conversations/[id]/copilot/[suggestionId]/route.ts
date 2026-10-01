import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import { CopilotError, getLatestInboundMessageId, resolveSuggestion } from "@/modules/ai/service";
import { toSuggestionDto, type CopilotStateDto } from "@/modules/ai/dto";
import { copilotErrorResponse } from "@/modules/ai/http";

/**
 * Records what the professional did with a suggestion: `USED_AS_DRAFT` (the
 * text went into the composer — not sent) or `DISCARDED`. JSON only: a
 * cross-site form cannot send `application/json` without a CORS preflight.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; suggestionId: string }> },
) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return new Response(null, { status: 401 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "BAD_REQUEST", message: "Expected application/json." }, { status: 415 });
  }
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "USED_AS_DRAFT" && action !== "DISCARDED") {
    return Response.json({ error: "BAD_REQUEST", message: "action must be USED_AS_DRAFT or DISCARDED." }, { status: 400 });
  }

  const { id, suggestionId } = await params;
  try {
    const row = await resolveSuggestion({
      organizationId: member.organizationId,
      member,
      conversationId: id,
      suggestionId,
      action,
    });
    const state: CopilotStateDto = {
      suggestion: toSuggestionDto(row, await getLatestInboundMessageId(member.organizationId, id)),
    };
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CopilotError) {
      return copilotErrorResponse(error);
    }
    throw error;
  }
}
