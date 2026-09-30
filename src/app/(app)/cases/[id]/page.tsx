import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import Link from "next/link";
import { getCaseForMember } from "@/modules/cases/service";
import { CASE_STATUS_TRANSITIONS } from "@/modules/cases/domain";
import { getContact } from "@/modules/contacts/service";
import { updateCaseAction, linkConversationToCaseAction, unlinkConversationFromCaseAction } from "@/modules/cases/actions";
import { listConversationsWithPreview, listLinkedConversations } from "@/modules/conversations/service";
import { listActivitiesForEntity } from "@/modules/audit/service";
import { ActivityFeed } from "@/app/(app)/activity-feed";
import { CASE_STATUS_LABELS } from "@/app/(app)/cases/status-labels";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import { SubmitButton } from "@/components/ui/submit-button";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const caseRecord = await getCaseForMember(member.organizationId, member, id);
  return { title: pageTitle(caseRecord?.title, "Casos", member.organizationName) };
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const caseRecord = await getCaseForMember(member.organizationId, member, id);

  if (!caseRecord) {
    notFound();
  }

  const [contact, members, activities, linkedConversations, contactConversations] = await Promise.all([
    getContact(member.organizationId, caseRecord.contactId),
    listOrganizationMembers(member.organizationId),
    listActivitiesForEntity(member.organizationId, "case", caseRecord.id),
    listLinkedConversations(member.organizationId, caseRecord.id),
    listConversationsWithPreview(member.organizationId, member, { contactId: caseRecord.contactId }),
  ]);

  const updateThisCase = updateCaseAction.bind(null, caseRecord.id);
  const linkConversationToThisCase = linkConversationToCaseAction.bind(null, caseRecord.id);
  const unlinkConversationFromThisCase = unlinkConversationFromCaseAction.bind(null, caseRecord.id);
  const availableStatuses = [caseRecord.status, ...CASE_STATUS_TRANSITIONS[caseRecord.status]];
  const delegates = members.filter((m) => m.role === "DELEGATE");
  const linkedConversationIds = new Set(linkedConversations.map((lc) => lc.conversation.id));
  const linkableConversations = contactConversations.filter((c) => !linkedConversationIds.has(c.id));

  return (
    <PageContainer>
      <PageHeader title={caseRecord.title} description={`Contacto: ${contact?.name ?? "—"}`} />

      <Card className="max-w-page-sm">
        <form action={updateThisCase} className="contents">
          <CardHeader>
            <CardTitle>Editar</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Título">
              <Input type="text" name="title" defaultValue={caseRecord.title} required />
            </Field>
            <Field label="Estado">
              <NativeSelect name="status" defaultValue={caseRecord.status} required>
                {availableStatuses.map((status) => (
                  <option key={status} value={status}>
                    {CASE_STATUS_LABELS[status]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Prioridad" optional description="Texto libre.">
              <Input type="text" name="priority" defaultValue={caseRecord.priority ?? ""} />
            </Field>
            <Field label="Asignar a" optional description="Solo delegados.">
              <NativeSelect name="assignedTo" defaultValue={caseRecord.assignedTo ?? ""}>
                <option value="">Sin asignar</option>
                {delegates.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Descripción" optional>
              <Textarea name="description" defaultValue={caseRecord.description ?? ""} rows={3} />
            </Field>
          </CardContent>
          <CardFooter>
            <SubmitButton>Guardar</SubmitButton>
          </CardFooter>
        </form>
      </Card>

      <Card className="max-w-page-sm">
        <CardHeader>
          <CardTitle>Conversaciones vinculadas</CardTitle>
        </CardHeader>
        <CardContent>
          {linkedConversations.length === 0 ? (
            <EmptyState variant="inline" title="Sin conversaciones vinculadas" />
          ) : (
            <ul className="flex flex-col">
              {linkedConversations.map(({ conversation, linkedAt }) => (
                <li
                  key={conversation.id}
                  className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0"
                >
                  <Link
                    href={`/inbox?conversation=${conversation.id}`}
                    className="focus-ring flex flex-col rounded-sm type-body text-foreground hover:underline"
                  >
                    <span>{conversation.channel}</span>
                    <RelativeTime date={linkedAt} className="type-caption text-foreground-lighter" />
                  </Link>
                  <form action={unlinkConversationFromThisCase}>
                    <input type="hidden" name="conversationId" value={conversation.id} />
                    <SubmitButton variant="ghost" size="sm">
                      Quitar
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        {linkableConversations.length > 0 && (
          <CardFooter>
            <form action={linkConversationToThisCase} className="flex w-full items-center gap-2">
              <NativeSelect name="conversationId" aria-label="Conversación a vincular" required defaultValue="" className="w-auto">
                <option value="" disabled>
                  Elige una conversación
                </option>
                {linkableConversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.channel}
                  </option>
                ))}
              </NativeSelect>
              <SubmitButton variant="outline" size="sm">
                Vincular
              </SubmitButton>
            </form>
          </CardFooter>
        )}
      </Card>

      <ActivityFeed activities={activities} />
    </PageContainer>
  );
}
