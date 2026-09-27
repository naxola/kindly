import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentOrganizationMember, listOrganizationMembers } from "@/modules/organizations/service";
import { listCases } from "@/modules/cases/service";
import { listContacts } from "@/modules/contacts/service";
import { NewCaseSheet } from "@/app/(app)/cases/new-case-sheet";
import { CASE_STATUS_LABELS, CASE_STATUS_TONES } from "@/app/(app)/cases/status-labels";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const member = await requireCurrentOrganizationMember();
  return { title: pageTitle("Casos", member.organizationName) };
}

export default async function CasesPage() {
  const member = await requireCurrentOrganizationMember();
  const [cases, contacts, members] = await Promise.all([
    listCases(member.organizationId),
    listContacts(member.organizationId),
    listOrganizationMembers(member.organizationId),
  ]);

  const contactNameById = new Map(contacts.map((contact) => [contact.id, contact.name]));

  return (
    <PageContainer>
      <PageHeader
        title="Casos"
        description="Un asunto que necesita gestión, distinto de una conversación"
        aside={
          <NewCaseSheet
            contacts={contacts}
            members={members.map((m) => ({ id: m.userId, name: m.name }))}
          />
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium text-foreground">
                <Link href={`/cases/${c.id}`} className="focus-ring rounded-sm">
                  {c.title}
                </Link>
              </TableCell>
              <TableCell className="text-foreground-lighter">{contactNameById.get(c.contactId) ?? "—"}</TableCell>
              <TableCell>
                <Badge tone={CASE_STATUS_TONES[c.status]}>{CASE_STATUS_LABELS[c.status]}</Badge>
              </TableCell>
            </TableRow>
          ))}
          {cases.length === 0 && (
            <TableEmpty
              colSpan={3}
              title="Todavía no hay casos"
              description="Crea el primero a partir de un contacto."
            />
          )}
        </TableBody>
      </Table>
    </PageContainer>
  );
}
