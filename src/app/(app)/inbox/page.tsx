import Link from "next/link";
import { AutoRefresh } from "@/app/(app)/inbox/auto-refresh";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listConversationsWithPreview } from "@/modules/conversations/service";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; unread?: string }>;
}) {
  const { channel, unread } = await searchParams;
  const member = await requireCurrentOrganizationMember();

  const [conversations, members] = await Promise.all([
    listConversationsWithPreview(member.organizationId, {
      channel: channel || undefined,
      unreadOnly: unread === "1",
    }),
    listOrganizationMembers(member.organizationId),
  ]);

  const delegateNameById = new Map(members.map((m) => [m.userId, m.name]));
  const allChannels = [...new Set(conversations.map((c) => c.channel))];

  const filterHref = (next: { channel?: string; unread?: boolean }) => {
    const params = new URLSearchParams();
    const nextChannel = next.channel !== undefined ? next.channel : channel;
    const nextUnread = next.unread !== undefined ? next.unread : unread === "1";
    if (nextChannel) params.set("channel", nextChannel);
    if (nextUnread) params.set("unread", "1");
    const query = params.toString();
    return query ? `/inbox?${query}` : "/inbox";
  };

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={5_000} />
      <div>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-zinc-500">
          Conversaciones de todos los canales conectados. El sistema decide el canal al responder.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={filterHref({ channel: "" })}
          className={`rounded border px-2 py-1 ${!channel ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-600"}`}
        >
          Todos los canales
        </Link>
        {allChannels.map((ch) => (
          <Link
            key={ch}
            href={filterHref({ channel: ch })}
            className={`rounded border px-2 py-1 ${channel === ch ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-600"}`}
          >
            {ch}
          </Link>
        ))}
        <span className="mx-1 text-zinc-300">|</span>
        <Link
          href={filterHref({ unread: unread !== "1" })}
          className={`rounded border px-2 py-1 ${unread === "1" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-600"}`}
        >
          Solo no leídos
        </Link>
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        {conversations.map((conversation) => (
          <li key={conversation.id} className="border-b border-zinc-100 py-2">
            <Link href={`/inbox/${conversation.id}`} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {conversation.unread && <span className="h-2 w-2 rounded-full bg-zinc-900" aria-label="No leído" />}
                <span className={conversation.unread ? "font-semibold" : ""}>{conversation.contactName}</span>
                {conversation.contactIsUnassigned && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Sin identificar</span>
                )}
                <span className="text-zinc-400">· {conversation.channel}</span>
                <span className="text-zinc-400">· {delegateNameById.get(conversation.delegateId) ?? "—"}</span>
              </div>
              <div className="flex items-center gap-3 text-zinc-500">
                <span className="max-w-xs truncate">{conversation.lastMessage?.body ?? "Sin mensajes"}</span>
                {conversation.lastMessage && (
                  <span className="whitespace-nowrap text-zinc-400">
                    {conversation.lastMessage.createdAt.toLocaleString("es-ES")}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
        {conversations.length === 0 && (
          <li className="py-4 text-center text-zinc-400">Todavía no hay conversaciones.</li>
        )}
      </ul>
    </div>
  );
}
