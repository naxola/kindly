import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getContactForMember } from "@/modules/contacts/service";
import { updateContactAction } from "@/modules/contacts/actions";
import { listActivitiesForEntity } from "@/modules/audit/service";
import { ActivityFeed } from "@/app/(app)/activity-feed";
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

  const activities = await listActivitiesForEntity(member.organizationId, "contact", contact.id);
  const updateThisContact = updateContactAction.bind(null, contact.id);

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

      <ActivityFeed activities={activities} />
    </PageContainer>
  );
}
