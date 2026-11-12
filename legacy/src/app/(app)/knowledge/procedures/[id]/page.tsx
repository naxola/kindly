import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { getProcedureWithVersions } from "@/modules/procedures/service";
import { publishProcedureVersionAction } from "@/modules/procedures/actions";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { PageSection } from "@/components/patterns/page-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const found = await getProcedureWithVersions(member.organizationId, id);
  return { title: pageTitle(found?.procedure.name, "Trámites", "Conocimiento", member.organizationName) };
}

export default async function ProcedureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireCurrentOrganizationMember();
  const found = await getProcedureWithVersions(member.organizationId, id);
  if (!found) {
    notFound();
  }

  const { procedure, versions } = found;
  const current = versions.find((v) => v.status === "CURRENT");
  const publish = publishProcedureVersionAction.bind(null, procedure.id);

  return (
    <PageContainer>
      <PageHeader title={procedure.name} description={procedure.description ?? undefined} />

      {member.role === "ADMIN" && (
        <Card className="max-w-page-sm">
          <form action={publish} className="contents">
            <CardHeader>
              <CardTitle>Publicar nueva versión</CardTitle>
            </CardHeader>
            <CardContent>
              <Field label="Pasos" optional description="Uno por línea, en orden.">
                <Textarea
                  name="steps"
                  rows={4}
                  defaultValue={current?.steps.map((s) => s.title).join("\n") ?? ""}
                />
              </Field>
              <Field label="Documentos requeridos" optional description="Uno por línea.">
                <Textarea
                  name="requiredDocuments"
                  rows={4}
                  defaultValue={current?.requiredDocuments.map((d) => d.name).join("\n") ?? ""}
                />
              </Field>
            </CardContent>
            <CardFooter>
              <SubmitButton>Publicar versión</SubmitButton>
            </CardFooter>
          </form>
        </Card>
      )}

      <PageSection title="Versiones" description="De la más reciente a la más antigua">
        {versions.map((version) => (
          <Card key={version.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Versión {version.version}
                <Badge tone={version.status === "CURRENT" ? "success" : "neutral"}>
                  {version.status === "CURRENT" ? "Vigente" : "Sustituida"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1">
                <p className="type-label text-foreground-light">Pasos</p>
                {version.steps.length === 0 ? (
                  <p className="type-body text-foreground-lighter">Sin pasos.</p>
                ) : (
                  <ol className="list-decimal pl-5 type-body text-foreground">
                    {version.steps.map((step) => (
                      <li key={step.id}>{step.title}</li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <p className="type-label text-foreground-light">Documentos requeridos</p>
                {version.requiredDocuments.length === 0 ? (
                  <p className="type-body text-foreground-lighter">Sin documentos requeridos.</p>
                ) : (
                  <ul className="list-disc pl-5 type-body text-foreground">
                    {version.requiredDocuments.map((doc) => (
                      <li key={doc.id}>{doc.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </PageSection>
    </PageContainer>
  );
}
