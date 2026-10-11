import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expectNoSeriousAccessibilityViolations } from "./axe-helpers";

/**
 * UI-10c (`docs/ui/CONVERSATION_WORKSPACE.md` §5.2): "Trámite y documentación"
 * in the contact's ficha — start a procedure for the person, mark each
 * required document received (or take it back), finish or cancel it. Only the
 * state is kept, never the files.
 */

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

test.use({ viewport: { width: 1600, height: 900 } });

test.afterAll(async () => {
  await sql.end();
});

test("a delegate runs a procedure from the ficha: start, mark documents, finish and cancel", async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const delegateName = `Tramita ${suffix}`;
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(delegateName);
  await page.getByPlaceholder("Email").fill(`${randomUUID()}@example.com`);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);

  const [org] = await sql`
    select o.id from organizations o
    join organization_members m on m.organization_id = o.id
    join users u on u.id = m.user_id
    where u.name = ${delegateName} limit 1`;

  // A published procedure with two required documents, defined by the organization.
  const procedureName = `Reagrupación ${suffix}`;
  const [procedure] = await sql`insert into procedures (organization_id, name) values (${org.id}, ${procedureName}) returning id`;
  const [version] = await sql`
    insert into procedure_versions (procedure_id, organization_id, version, status)
    values (${procedure.id}, ${org.id}, 1, 'CURRENT') returning id`;
  await sql`
    insert into procedure_required_documents (procedure_version_id, ordinal, name)
    values (${version.id}, 1, 'Pasaporte'), (${version.id}, 2, 'Empadronamiento')`;

  // A conversation through the fake channel.
  await page.goto("/organization/channels");
  await page.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();
  const [account] = await sql`
    select id from messaging_accounts
    where channel = 'fake' and delegate_id = (select id from users where name = ${delegateName})
    order by created_at desc limit 1`;
  const contactName = `Persona ${suffix}`;
  const webhook = await request.post(`/api/webhooks/fake/${account.id}`, {
    headers: { "x-fake-signature": "fake-shared-secret" },
    data: JSON.stringify({
      externalConversationId: `chat-${randomUUID()}`,
      externalMessageId: `msg-${randomUUID()}`,
      externalContactId: `provider-${randomUUID()}`,
      contactDisplayName: contactName,
      text: "Quiero iniciar el trámite",
    }),
  });
  expect(webhook.status()).toBe(200);
  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByText(contactName)).toBeVisible();
  }).toPass({ timeout: 15_000 });
  await page.getByText(contactName).click();

  const ficha = page.getByRole("heading", { name: "Ficha del afiliado" });
  await expect(ficha).toBeVisible();
  await expect(page.getByText("Sin trámite en curso")).toBeVisible();

  // Start it.
  await page.getByLabel("Elegir un trámite para iniciar").selectOption({ label: procedureName });
  await page.getByRole("button", { name: "Iniciar", exact: true }).click();
  const article = page.getByRole("article", { name: `Trámite ${procedureName}` });
  await expect(article).toBeVisible();
  await expect(article.getByText("0 de 2 recibidos")).toBeVisible();
  await expect(article.getByText("Falta")).toHaveCount(2);
  await expect(page.getByLabel("Elegir un trámite para iniciar")).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page, "/inbox con trámite en curso");

  // Mark the passport received (with the channel it came through), then take it back.
  await article.getByRole("button", { name: "Marcar como recibido Pasaporte" }).click();
  await expect(article.getByText("1 de 2 recibidos")).toBeVisible();
  await expect(article.getByText(/Recibido · fake · /)).toBeVisible();
  await article.getByRole("button", { name: "Deshacer recibido de Pasaporte" }).click();
  await expect(article.getByText("0 de 2 recibidos")).toBeVisible();

  // Finishing with documents missing asks first; confirming closes the procedure.
  await article.getByRole("button", { name: "Terminar trámite" }).click();
  const confirm = page.getByRole("dialog", { name: "Terminar trámite" });
  await expect(confirm.getByText(/todavía tiene documentos sin recibir/)).toBeVisible();
  await confirm.getByRole("button", { name: "Terminar trámite" }).click();
  await expect(page.getByText("Sin trámite en curso")).toBeVisible();

  // Once closed it can be started again, and then cancelled.
  await page.getByLabel("Elegir un trámite para iniciar").selectOption({ label: procedureName });
  await page.getByRole("button", { name: "Iniciar", exact: true }).click();
  await expect(article).toBeVisible();
  await article.getByRole("button", { name: "Cancelar trámite" }).click();
  await page.getByRole("dialog", { name: "Cancelar trámite" }).getByRole("button", { name: "Cancelar trámite" }).click();
  await expect(page.getByText("Sin trámite en curso")).toBeVisible();

  // The history of the contact kept the trace.
  const [{ count }] = await sql`
    select count(*)::int as count from activities
    where organization_id = ${org.id} and type in ('PROCEDURE_STARTED', 'PROCEDURE_COMPLETED', 'PROCEDURE_CANCELLED', 'PROCEDURE_DOCUMENT_RECEIVED', 'PROCEDURE_DOCUMENT_UNMARKED')`;
  expect(count).toBe(6);
});
