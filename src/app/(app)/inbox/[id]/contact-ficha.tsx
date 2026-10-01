"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { markContactIdentifiedAction, reassignConversationContactAction } from "@/modules/conversations/actions";
import { linkCurrentConversationToCaseAction } from "@/modules/cases/actions";
import type { ConversationWorkspaceData } from "@/app/(app)/inbox/conversation-workspace-types";
import { IdentificationSection } from "@/app/(app)/inbox/[id]/identification-section";
import { ReferenceDelegateSection } from "@/app/(app)/contacts/reference-delegate-section";
import { MembershipStatus } from "@/app/(app)/contacts/membership-status";
import { CASE_STATUS_LABELS, CASE_STATUS_TONES } from "@/app/(app)/cases/status-labels";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NativeSelect } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";

function FichaSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-border px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono type-overline font-normal text-foreground-lighter">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const ITEM = "flex items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 py-2";

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
    <div className="flex min-h-full flex-col bg-background-muted">
      <div className="sticky top-0 z-(--z-sticky) flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4">
        <h3 className="type-label font-semibold text-foreground">Ficha del afiliado</h3>
        <span className="type-caption text-foreground-lighter">Solo lectura</span>
      </div>

      <FichaSection title="Afiliación">
        <MembershipStatus membership={ficha.membership} boxed />
      </FichaSection>

      <FichaSection
        title="Contacto"
        action={
          <Link href={`/contacts/${contact.id}`} className="focus-ring rounded-sm type-caption text-primary hover:underline">
            Editar en la ficha completa
          </Link>
        }
      >
        <dl className="grid grid-cols-[6rem_1fr] gap-x-2.5 gap-y-1.5 type-label font-normal text-foreground">
          <dt className="text-foreground-lighter">Teléfono</dt>
          <dd className="[overflow-wrap:anywhere]">{contact.phoneE164 ?? "—"}</dd>
          <dt className="text-foreground-lighter">Email</dt>
          <dd className="[overflow-wrap:anywhere]">{contact.email ?? "—"}</dd>
          <dt className="text-foreground-lighter">Canal</dt>
          <dd>{data.channel}</dd>
          <dt className="text-foreground-lighter">Delegado</dt>
          <dd>{data.delegateName}</dd>
          {contact.notes && (
            <>
              <dt className="text-foreground-lighter">Notas</dt>
              <dd>{contact.notes}</dd>
            </>
          )}
        </dl>
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
          <ul className="flex flex-col gap-1.5">
            {ficha.cases.map((c) => (
              <li key={c.id} className={cn(ITEM, "justify-between")}>
                <Link href={`/cases/${c.id}`} className="focus-ring min-w-0 flex-1 truncate rounded-sm type-label font-medium text-foreground hover:underline">
                  {c.title}
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {c.linked && <Badge tone="neutral">Vinculado</Badge>}
                  <Badge tone={CASE_STATUS_TONES[c.status]}>{CASE_STATUS_LABELS[c.status]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
        {ficha.cases.some((c) => !c.linked) && (
          <form
            action={async (formData) => {
              await linkCurrentConversationToCaseAction(data.conversationId, formData);
              onMutated();
            }}
            className="flex items-center gap-2"
          >
            <NativeSelect name="caseId" aria-label="Vincular esta conversación a un caso" className="w-auto" defaultValue="">
              <option value="" disabled>
                Vincular a un caso...
              </option>
              {ficha.cases
                .filter((c) => !c.linked)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </NativeSelect>
            <SubmitButton size="sm" variant="outline">
              Vincular
            </SubmitButton>
          </form>
        )}
      </FichaSection>

      <FichaSection title="Tareas pendientes">
        {ficha.pendingTasks.length === 0 ? (
          <EmptyState variant="inline" title="Sin tareas pendientes" />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ficha.pendingTasks.map((task) => (
              <li key={task.id} className={cn(ITEM, "justify-between")}>
                <Link href={`/tasks/${task.id}`} className="focus-ring min-w-0 flex-1 truncate rounded-sm type-label font-medium text-foreground hover:underline">
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
          <ul className="flex flex-col gap-1.5">
            {ficha.otherConversations.map((conversation) => (
              <li key={conversation.id} className={ITEM}>
                <Link
                  href={`/inbox?conversation=${conversation.id}`}
                  prefetch={false}
                  onClick={(event) => {
                    // Same panel, different conversation — no route change
                    // (docs/ui/CHAT.md §1). A modified click still opens a tab.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    event.preventDefault();
                    onOpenConversation(conversation.id);
                  }}
                  className="focus-ring flex min-w-0 flex-1 flex-col rounded-sm type-label text-foreground hover:underline"
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
