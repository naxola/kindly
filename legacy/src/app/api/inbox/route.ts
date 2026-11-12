import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import { parseInboxFilters } from "@/app/(app)/inbox/inbox-filters";
import { getInboxList } from "@/app/(app)/inbox/inbox-data";

/**
 * The Inbox list for one set of filters — the client cache's source
 * (docs/ui/CHAT.md §1): fetched when a filter combination is first used,
 * then refreshed in the background every few seconds, same "no realtime
 * infrastructure" choice as the conversation thread (docs/DECISIONS.md,
 * 2026-09-25). Scoped to the member's organization like every other read.
 */
export async function GET(request: Request) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    return new Response(null, { status: 401 });
  }
  const filters = parseInboxFilters(new URL(request.url).searchParams);
  return Response.json(await getInboxList(member, filters), { headers: { "Cache-Control": "no-store" } });
}
