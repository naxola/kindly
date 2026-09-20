import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import {
  getConversationWithDetails,
  listMessages,
  markConversationRead,
} from "@/modules/conversations/service";
import { listContacts } from "@/modules/contacts/service";
import { sendReplyAction, markContactIdentifiedAction, reassignConversationContactAction } from "@/modules/conversations/actions";

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

  // Opening the conversation is what "read" means here — no separate
  // action to wire up, and this route is already fully dynamic (session
  // read on every request), never cached (docs/conversations/service.ts).
  await markConversationRead(member.organizationId, id);

  const [messages, members, contacts] = await Promise.all([
    listMessages(member.organizationId, id),
    listOrganizationMembers(member.organizationId),
    listContacts(member.organizationId),
  ]);

  const delegateName = members.find((m) => m.userId === details.delegateId)?.name ?? "—";
  const otherContacts = contacts.filter((c) => c.id !== details.contact.id);
  const sendReplyToThisConversation = sendReplyAction.bind(null, id);
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

      <ul className="flex flex-col gap-2">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-md rounded px-3 py-2 text-sm ${
                message.direction === "OUTBOUND" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-900"
              }`}
            >
              <p>{message.body}</p>
              <p className={`mt-1 text-xs ${message.direction === "OUTBOUND" ? "text-zinc-300" : "text-zinc-400"}`}>
                {message.createdAt.toLocaleString("es-ES")}
                {message.direction === "OUTBOUND" && ` · ${message.deliveryStatus}`}
                {/* Coexistence: an outbound message may have been written on
                    the delegate's own phone, not here (PKG-005). */}
                {message.direction === "OUTBOUND" && message.sentFromDevice && " · desde el móvil"}
              </p>
            </div>
          </li>
        ))}
        {messages.length === 0 && <li className="py-4 text-center text-sm text-zinc-400">Sin mensajes todavía.</li>}
      </ul>

      <form action={sendReplyToThisConversation} className="flex flex-col gap-2 rounded border border-zinc-200 p-3">
        <textarea
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
          name="text"
          placeholder="Escribe una respuesta..."
          rows={3}
          required
        />
        <button type="submit" className="w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white">
          Enviar
        </button>
      </form>
    </div>
  );
}
