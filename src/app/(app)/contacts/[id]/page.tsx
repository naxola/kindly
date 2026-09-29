import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { getContactForMember } from "@/modules/contacts/service";
import { getActiveAssignment, listAssignmentHistory } from "@/modules/contacts/assignments";
import { updateContactAction } from "@/modules/contacts/actions";
import { listActivitiesForEntity } from "@/modules/audit/service";
import { ActivityFeed } from "@/app/(app)/activity-feed";
import { ReferenceDelegateSection } from "@/app/(app)/contacts/reference-delegate-section";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const contact = await getContactForMember(member.organizationId, member, id);
  return { title: pageTitle(contact?.name, "Contactos", member.organizationName) };
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const contact = await getContactForMember(member.organizationId, member, id);

  if (!contact) {
    notFound();
  }

  const isAdmin = member.role === "ADMIN";
  const [activities, activeAssignment, history, members] = await Promise.all([
    listActivitiesForEntity(member.organizationId, "contact", contact.id),
    getActiveAssignment(member.organizationId, contact.id),
    listAssignmentHistory(member.organizationId, contact.id),
    listOrganizationMembers(member.organizationId),
  ]);
  const updateThisContact = updateContactAction.bind(null, contact.id);
  const nameById = new Map(members.map((m) => [m.userId, m.name]));

  return (
    <PageContainer>
      <PageHeader title={contact.name} description={`Creado el ${contact.createdAt.toLocaleDateString("es-ES")}`} />

      <Card className="max-w-page-sm">
        <form action={updateThisContact} className="contents">
          <CardHeader>
            <CardTitle>Editar</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Nombre">
              <Input type="text" name="name" defaultValue={contact.name} required />
            </Field>
            <Field label="Teléfono" optional>
              <Input type="tel" name="phoneE164" defaultValue={contact.phoneE164 ?? ""} placeholder="+34600111222" />
            </Field>
            <Field label="Email" optional>
              <Input type="email" name="email" defaultValue={contact.email ?? ""} />
            </Field>
            <Field label="Notas" optional>
              <Input type="text" name="notes" defaultValue={contact.notes ?? ""} />
            </Field>
          </CardContent>
          <CardFooter>
            <SubmitButton>Guardar</SubmitButton>
          </CardFooter>
        </form>
      </Card>

      {/* PKG-014: quién responde por este afiliado. También se muestra en la
          ficha del panel de conversación (UI-10a, `ReferenceDelegateSection`). */}
      <Card className="max-w-page-sm">
        <CardHeader>
          <CardTitle>Delegado de referencia</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferenceDelegateSection
            isAdmin={isAdmin}
            contactId={contact.id}
            contactName={contact.name}
            activeAssignment={activeAssignment}
            history={history}
            delegates={members.map((m) => ({ userId: m.userId, name: m.name }))}
            nameById={nameById}
          />
        </CardContent>
      </Card>

      <ActivityFeed activities={activities} />
    </PageContainer>
  );
}
