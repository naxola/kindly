import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { listContactsForMember } from "@/modules/contacts/service";
import { NewContactSheet } from "@/app/(app)/contacts/new-contact-sheet";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Contactos", member.organizationName) };
}

export default async function ContactsPage() {
  const member = await requireCurrentOrganizationMember();
  const contacts = await listContactsForMember(member.organizationId, member);

  return (
    <PageContainer>
      <PageHeader
        title="Contactos"
        description="Personas con las que la organización tiene una relación. No son usuarios de Kindly"
        aside={<NewContactSheet />}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => (
            <TableRow key={contact.id}>
              <TableCell className="font-medium text-foreground">
                <Link href={`/contacts/${contact.id}`} className="focus-ring rounded-sm">
                  {contact.name}
                </Link>
              </TableCell>
              <TableCell className="text-foreground-lighter">{contact.phoneE164 ?? "—"}</TableCell>
              <TableCell className="text-foreground-lighter">{contact.email ?? "—"}</TableCell>
            </TableRow>
          ))}
          {contacts.length === 0 && (
            <TableEmpty
              colSpan={3}
              title="Todavía no hay contactos"
              description="Crea el primero o espera a que te escriba alguien."
            />
          )}
        </TableBody>
      </Table>
    </PageContainer>
  );
}
