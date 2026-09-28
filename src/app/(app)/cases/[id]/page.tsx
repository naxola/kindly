import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { getCaseForMember } from "@/modules/cases/service";
import { caseStatus } from "@/modules/cases/schema";
import { getContact } from "@/modules/contacts/service";
import { updateCaseAction } from "@/modules/cases/actions";
import { listActivitiesForEntity } from "@/modules/audit/service";
import { ActivityFeed } from "@/app/(app)/activity-feed";
import { CASE_STATUS_LABELS } from "@/app/(app)/cases/status-labels";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
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

  const [contact, members, activities] = await Promise.all([
    getContact(member.organizationId, caseRecord.contactId),
    listOrganizationMembers(member.organizationId),
    listActivitiesForEntity(member.organizationId, "case", caseRecord.id),
  ]);

  const updateThisCase = updateCaseAction.bind(null, caseRecord.id);

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
                {caseStatus.enumValues.map((status) => (
                  <option key={status} value={status}>
                    {CASE_STATUS_LABELS[status]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Prioridad" optional description="Texto libre.">
              <Input type="text" name="priority" defaultValue={caseRecord.priority ?? ""} />
            </Field>
            <Field label="Asignar a" optional>
              <NativeSelect name="assignedTo" defaultValue={caseRecord.assignedTo ?? ""}>
                <option value="">Sin asignar</option>
                {members.map((m) => (
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

      <ActivityFeed activities={activities} />
    </PageContainer>
  );
}
