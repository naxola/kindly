import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import {
  channelSupportsTypingIndicator,
  getConversationThreadState,
  getConversationWithDetails,
} from "@/modules/conversations/service";
import { listContacts } from "@/modules/contacts/service";
import { markContactIdentifiedAction, reassignConversationContactAction } from "@/modules/conversations/actions";
import { ConversationThread } from "@/app/(app)/inbox/[id]/conversation-thread";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const details = await getConversationWithDetails(member.organizationId, id);

  if (!details) {
    notFound();
  }

  // Opening the conversation is what "read" means here (PKG-004);
  // `getConversationThreadState` marks it read, on first render and on
  // every poll of the open screen (PKG-013).
  const [threadState, members, contacts] = await Promise.all([
    getConversationThreadState(member.organizationId, id),
    listOrganizationMembers(member.organizationId),
    listContacts(member.organizationId),
  ]);
  if (!threadState) {
    notFound();
  }

  const delegateName = members.find((m) => m.userId === details.delegateId)?.name ?? "—";
  const otherContacts = contacts.filter((c) => c.id !== details.contact.id);
  const markThisContactIdentified = markContactIdentifiedAction.bind(null, details.contact.id, id);
  const reassignThisConversation = reassignConversationContactAction.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/inbox" className="text-sm text-zinc-500 underline">
          ← Inbox
        </Link>
        <h1 className="text-xl font-semibold">
          <Link href={`/contacts/${details.contact.id}`} className="underline">
            {details.contact.name}
          </Link>
        </h1>
        <p className="text-sm text-zinc-500">
          {details.conversation.channel} · {delegateName}
        </p>
      </div>

      {details.contact.isUnassigned && (
        <div className="flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">
            Contact no identificado — creado automáticamente a partir de este mensaje.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <form action={markThisContactIdentified}>
              <button type="submit" className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white">
                Marcar como identificado
              </button>
            </form>
            <Link href={`/contacts/${details.contact.id}`} className="text-xs underline">
              Editar sus datos
            </Link>
            {otherContacts.length > 0 && (
              <form action={reassignThisConversation} className="flex items-center gap-2">
                <select name="targetContactId" aria-label="Reasignar a" className="rounded border border-amber-300 px-2 py-1 text-xs" defaultValue="">
                  <option value="" disabled>
                    Reasignar a...
                  </option>
                  {otherContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="rounded border border-amber-400 px-2 py-1 text-xs font-medium text-amber-900">
                  Reasignar
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <ConversationThread
        key={id}
        conversationId={id}
        initialState={threadState}
        supportsTyping={channelSupportsTypingIndicator(details.conversation.channel)}
      />
    </div>
  );
}
