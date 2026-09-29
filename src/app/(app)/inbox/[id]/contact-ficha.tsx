"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { markContactIdentifiedAction, reassignConversationContactAction } from "@/modules/conversations/actions";
import type { ConversationWorkspaceData } from "@/app/(app)/inbox/conversation-workspace-types";
import { IdentificationSection } from "@/app/(app)/inbox/[id]/identification-section";
import { ReferenceDelegateSection } from "@/app/(app)/contacts/reference-delegate-section";
import { CASE_STATUS_LABELS, CASE_STATUS_TONES } from "@/app/(app)/cases/status-labels";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

function FichaSection({ title, children }: { title: string; children: ReactNode }) {
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
 * exists today. Renders `ConversationWorkspaceData` as-is — no fetching of
 * its own; after a mutation it asks the panel to reload (`onMutated`),
 * since the panel owns that data rather than a server route.
 *
 * Afiliación (UI-10b), trámites/documentación (UI-10c) and the AI summary
 * (UI-10d) have no domain yet and are deliberately absent, not stubbed.
 */
export function ContactFicha({
  data,
  onOpenConversation,
  onMutated,
}: {
  data: ConversationWorkspaceData;
  onOpenConversation: (conversationId: string) => void;
  onMutated: () => void;
}) {
  const { contact, ficha } = data;

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
            <dd>{data.channel}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-foreground-lighter">Delegado</dt>
            <dd>{data.delegateName}</dd>
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
            otherContacts={ficha.otherContacts}
            markContactIdentified={async () => {
              await markContactIdentifiedAction(contact.id);
              onMutated();
            }}
            reassignConversation={async (formData) => {
              await reassignConversationContactAction(data.conversationId, formData);
              onMutated();
            }}
          />
        </FichaSection>
      )}

      <FichaSection title="Delegado de referencia">
        <ReferenceDelegateSection
          isAdmin={ficha.isAdmin}
          contactId={contact.id}
          contactName={contact.name}
          activeAssignment={ficha.activeAssignment}
          history={ficha.assignmentHistory}
          delegates={ficha.delegates}
          onReassigned={onMutated}
        />
      </FichaSection>

      <FichaSection title="Casos abiertos">
        {ficha.cases.length === 0 ? (
          <EmptyState variant="inline" title="Sin casos abiertos" />
        ) : (
          <ul className="flex flex-col gap-2">
            {ficha.cases.map((c) => (
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
        {ficha.pendingTasks.length === 0 ? (
          <EmptyState variant="inline" title="Sin tareas pendientes" />
        ) : (
          <ul className="flex flex-col gap-2">
            {ficha.pendingTasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2">
                <Link href={`/tasks/${task.id}`} className="focus-ring truncate rounded-sm type-body text-foreground hover:underline">
                  {task.title}
                </Link>
                <span className="shrink-0 type-caption text-foreground-lighter">
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString("es-ES") : "Sin fecha"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </FichaSection>

      <FichaSection title="Otras conversaciones">
        {ficha.otherConversations.length === 0 ? (
          <EmptyState variant="inline" title="No hay otras conversaciones" />
        ) : (
          <ul className="flex flex-col gap-2">
            {ficha.otherConversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/inbox/${conversation.id}`}
                  onClick={(event) => {
                    // Same panel, different conversation — no route change
                    // (docs/ui/CHAT.md §1). A modified click still opens a tab.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    event.preventDefault();
                    onOpenConversation(conversation.id);
                  }}
                  className="focus-ring flex flex-col rounded-sm type-body text-foreground hover:underline"
                >
                  <span>
                    {conversation.channel} · {conversation.delegateName}
                  </span>
                  {conversation.lastMessageBody && (
                    <span className="truncate type-caption text-foreground-lighter">{conversation.lastMessageBody}</span>
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
