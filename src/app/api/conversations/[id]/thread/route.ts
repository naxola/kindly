import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import { getConversationThreadState } from "@/modules/conversations/service";

/**
 * Polled every few seconds by an open conversation (PKG-013) — the chosen
 * way to make the Inbox live without realtime infrastructure, which Vercel
 * functions can't hold open anyway (docs/DECISIONS.md, 2026-09-25).
 * Scoped to the member's organization like every other read.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return new Response(null, { status: 401 });
  }
  const { id } = await params;
  const state = await getConversationThreadState(member.organizationId, id);
  if (!state) {
    return new Response(null, { status: 404 });
  }
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
