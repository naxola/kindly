import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import { countConversationsByView, listConversationsWithPreview, type InboxView } from "@/modules/conversations/service";

const VALID_VIEWS: InboxView[] = ["pending", "unread", "unassigned", "all"];

function parseView(value: string | null): InboxView {
  return VALID_VIEWS.includes(value as InboxView) ? (value as InboxView) : "pending";
}

/**
 * Polled by the Inbox list every few seconds (UI-5, docs/ui/INBOX.md §6) —
 * same "no realtime infrastructure" choice as the conversation thread
 * (docs/DECISIONS.md, 2026-09-25). Scoped to the member's organization like
 * every other read; view/search/channel/delegate come from the query
 * string, the same filters `listConversationsWithPreview` takes.
 */
export async function GET(request: Request) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return new Response(null, { status: 401 });
  }

  const url = new URL(request.url);
  const filters = {
    view: parseView(url.searchParams.get("view")),
    search: url.searchParams.get("search")?.trim() || undefined,
    channel: url.searchParams.get("channel")?.trim() || undefined,
    delegateId: url.searchParams.get("delegateId")?.trim() || undefined,
  };

  const [conversations, counts] = await Promise.all([
    listConversationsWithPreview(member.organizationId, filters),
    countConversationsByView(member.organizationId, { channel: filters.channel, delegateId: filters.delegateId }),
  ]);

  return Response.json({ conversations, counts }, { headers: { "Cache-Control": "no-store" } });
}
