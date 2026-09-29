import { redirect } from "next/navigation";
import { CONVERSATION_PARAM } from "@/app/(app)/inbox/inbox-filters";

/**
 * Old-style link to a conversation (`/inbox/<id>`, before the open
 * conversation became Inbox state — docs/ui/CHAT.md §1). Kept so existing
 * links and bookmarks still land on it: `/inbox?conversation=<id>`, with
 * any other query string preserved.
 */
export default async function LegacyConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string" && key !== CONVERSATION_PARAM) query.set(key, value);
  }
  query.set(CONVERSATION_PARAM, id);
  redirect(`/inbox?${query.toString()}`);
}
