import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import {
  CopilotError,
  generateSuggestion,
  getLatestInboundMessageId,
  getLatestSuggestion,
} from "@/modules/ai/service";
import { toSuggestionDto, type CopilotStateDto } from "@/modules/ai/dto";
import { copilotErrorResponse } from "@/modules/ai/http";

/**
 * Copilot API (Fase 8). GET: the conversation's latest suggestion, if any.
 * POST: generate a new one on request. Both answer with the DTO of
 * `ai/dto.ts` only — nothing about the model — and neither writes to
 * `messages`: the only way a suggestion reaches a Contact is the composer's
 * own Send.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return new Response(null, { status: 401 });
  }
  const { id } = await params;
  const row = await getLatestSuggestion(member.organizationId, member, id);
  const body: CopilotStateDto = {
    suggestion: row ? toSuggestionDto(row, await getLatestInboundMessageId(member.organizationId, id)) : null,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return new Response(null, { status: 401 });
  }
  const { id } = await params;
  try {
    const row = await generateSuggestion({ organizationId: member.organizationId, member, conversationId: id });
    const body: CopilotStateDto = {
      suggestion: toSuggestionDto(row, await getLatestInboundMessageId(member.organizationId, id)),
    };
    return Response.json(body, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CopilotError) {
      return copilotErrorResponse(error);
    }
    throw error;
  }
}
