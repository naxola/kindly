import Link from "next/link";
import type { contacts } from "@/modules/contacts/schema";
import type { ContactAssignment } from "@/modules/contacts/assignments";
import type { cases } from "@/modules/cases/schema";
import type { tasks } from "@/modules/tasks/schema";
import type { ConversationPreview } from "@/modules/conversations/service";
import { isTaskPending } from "@/modules/tasks/service";
import { IdentificationSection } from "@/app/(app)/inbox/[id]/identification-section";
import { ReferenceDelegateSection } from "@/app/(app)/contacts/reference-delegate-section";
import { CASE_STATUS_LABELS, CASE_STATUS_TONES } from "@/app/(app)/cases/status-labels";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type ContactRecord = typeof contacts.$inferSelect;
type CaseRecord = typeof cases.$inferSelect;
type TaskRecord = typeof tasks.$inferSelect;

function FichaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border px-4 py-4 first:border-t-0">
      <h3 className="type-label text-foreground-light">{title}</h3>
      {children}
    </section>
  );
}

/**
 * "Ficha del afiliado" (UI-10a, `docs/ui/CONVERSATION_WORKSPACE.md` §3): a
 * read-only second column next to the chat, built from data that already
 * exists today. A Server Component — everything it needs is already
 * resolved by the page (`[id]/page.tsx` / `@sheet/(.)[id]/page.tsx`), the
 * same way those pages already hand a fully-built `ConversationThreadState`
 * to `ConversationSheet` — so it does no fetching of its own.
 *
 * Only the sections the underlying domain already supports today are here.
 * Afiliación (UI-10b), trámites/documentación (UI-10c) and the AI summary
 * (UI-10d) have no domain yet and are deliberately absent, not stubbed.
 */
export function ContactFicha({
  contact,
  channel,
  delegateName,
  isAdmin,
  otherContacts,
  markContactIdentified,
  reassignConversation,
  activeAssignment,
  assignmentHistory,
  delegates,
  nameById,
  cases,
  tasks,
  otherConversations,
}: {
  contact: ContactRecord;
  channel: string;
  delegateName: string;
  isAdmin: boolean;
  otherContacts: { id: string; name: string }[];
  markContactIdentified: () => Promise<void>;
  reassignConversation: (formData: FormData) => Promise<void>;
  activeAssignment: ContactAssignment | null;
  assignmentHistory: ContactAssignment[];
  delegates: { userId: string; name: string }[];
  nameById: Map<string, string>;
  cases: CaseRecord[];
  tasks: TaskRecord[];
  otherConversations: ConversationPreview[];
}) {
  const pendingTasks = tasks
    .filter(isTaskPending)
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });

  return (
    <div className="flex flex-col">
      <FichaSection title="Contacto">
        <dl className="flex flex-col gap-1 type-body text-foreground">
          <div className="flex justify-between gap-2">
            <dt className="text-foreground-lighter">Teléfono</dt>
            <dd>{contact.phoneE164 ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-foreground-lighter">Email</dt>
            <dd className="truncate">{contact.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-foreground-lighter">Canal</dt>
            <dd>{channel}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-foreground-lighter">Delegado</dt>
            <dd>{delegateName}</dd>
          </div>
          {contact.notes && <p className="mt-1 type-caption text-foreground-lighter">{contact.notes}</p>}
        </dl>
        <Link href={`/contacts/${contact.id}`} className="type-caption text-primary hover:underline">
          Editar en la ficha completa
        </Link>
      </FichaSection>

      {contact.isUnassigned && (
        <FichaSection title="Identificación">
          <IdentificationSection
            otherContacts={otherContacts}
            markContactIdentified={markContactIdentified}
            reassignConversation={reassignConversation}
          />
        </FichaSection>
      )}

      <FichaSection title="Delegado de referencia">
        <ReferenceDelegateSection
          isAdmin={isAdmin}
          contactId={contact.id}
          contactName={contact.name}
          activeAssignment={activeAssignment}
          history={assignmentHistory}
          delegates={delegates}
          nameById={nameById}
        />
      </FichaSection>

      <FichaSection title="Casos abiertos">
        {cases.length === 0 ? (
          <EmptyState variant="inline" title="Sin casos abiertos" />
        ) : (
          <ul className="flex flex-col gap-2">
            {cases.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <Link href={`/cases/${c.id}`} className="focus-ring truncate rounded-sm type-body text-foreground hover:underline">
                  {c.title}
                </Link>
                <Badge tone={CASE_STATUS_TONES[c.status]}>{CASE_STATUS_LABELS[c.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </FichaSection>

      <FichaSection title="Tareas pendientes">
        {pendingTasks.length === 0 ? (
          <EmptyState variant="inline" title="Sin tareas pendientes" />
        ) : (
          <ul className="flex flex-col gap-2">
            {pendingTasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2">
                <Link href={`/tasks/${task.id}`} className="focus-ring truncate rounded-sm type-body text-foreground hover:underline">
                  {task.title}
                </Link>
                <span className="shrink-0 type-caption text-foreground-lighter">
                  {task.dueDate ? task.dueDate.toLocaleDateString("es-ES") : "Sin fecha"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </FichaSection>

      <FichaSection title="Otras conversaciones">
        {otherConversations.length === 0 ? (
          <EmptyState variant="inline" title="No hay otras conversaciones" />
        ) : (
          <ul className="flex flex-col gap-2">
            {otherConversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/inbox/${conversation.id}`}
                  className="focus-ring flex flex-col rounded-sm type-body text-foreground hover:underline"
                >
                  <span>
                    {conversation.channel} · {nameById.get(conversation.delegateId) ?? "—"}
                  </span>
                  {conversation.lastMessage && (
                    <span className="truncate type-caption text-foreground-lighter">{conversation.lastMessage.body}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </FichaSection>
    </div>
  );
}
