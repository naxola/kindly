import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import { getConversationWorkspace } from "@/app/(app)/inbox/conversation-workspace-data";

/**
 * The conversation panel's data for a click (or a hover prefetch) inside
 * the Inbox — the panel opens client-side without a route navigation
 * (docs/ui/CHAT.md §1), so it loads its own data here. Never marks the
 * conversation read: a prefetch goes through this same endpoint, and the
 * open panel's own thread poll (`/thread`) is what marks it read.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return new Response(null, { status: 401 });
  }
  const { id } = await params;
  const data = await getConversationWorkspace(member, id, { markRead: false });
  if (!data) {
    return new Response(null, { status: 404 });
  }
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
