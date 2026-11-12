import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * Fase 6 (`project/TASKS.md`) — Cases: real state machine for `status`
 * (`docs/DECISIONS.md`, supersedes PKG-002's "sin restricciones"),
 * assignment restricted to DELEGATE, and the Conversation ↔ Case link UI
 * (`conversation_cases`, deferred from PKG-003). SQL bypass for the
 * invitation token and the fake MessagingAccount id, same pattern as
 * `contact-assignments.spec.ts`/`inbox.spec.ts`.
 */

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

test.afterAll(async () => {
  await sql.end();
});

async function register(page: import("@playwright/test").Page, name: string) {
  const email = `${randomUUID()}@example.com`;
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  return email;
}

async function inviteAndAccept(
  adminPage: import("@playwright/test").Page,
  browser: import("@playwright/test").Browser,
  name: string,
) {
  const email = `${randomUUID()}@example.com`;
  await adminPage.goto("/organization/members");
  await adminPage.getByRole("button", { name: "Invitar" }).click();
  const dialog = adminPage.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Rol").selectOption("DELEGATE");
  await dialog.getByRole("button", { name: "Invitar" }).click();
  await expect(adminPage.getByText(email)).toBeVisible();

  const [invitation] = await sql`select token from organization_invitations where email = ${email} limit 1`;

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/invite/${invitation.token}`);
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await context.close();
}

async function createContact(page: import("@playwright/test").Page, name: string) {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Nuevo contacto" }).click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByRole("button", { name: "Crear contacto" }).click();
  await expect(page.getByRole("link", { name: name })).toBeVisible();
}

async function createCase(page: import("@playwright/test").Page, contactName: string, caseTitle: string) {
  await page.goto("/cases");
  await page.getByRole("button", { name: "Nuevo caso" }).click();
  await page.getByLabel("Contacto").selectOption({ label: contactName });
  await page.getByLabel("Título").fill(caseTitle);
  await page.getByRole("button", { name: "Crear caso" }).click();
  await expect(page.getByRole("link", { name: caseTitle })).toBeVisible();
  await page.getByRole("link", { name: caseTitle }).click();
  await expect(page).toHaveURL(/\/cases\/[^/]+$/);
}

test("case status only offers the valid next transitions at each step", async ({ page }) => {
  const contactName = `Contact ${randomUUID().slice(0, 8)}`;
  const caseTitle = `Case ${randomUUID().slice(0, 8)}`;
  await register(page, "Lifecycle User");
  await createContact(page, contactName);
  await createCase(page, contactName, caseTitle);

  const status = page.getByLabel("Estado");
  const changedActivity = page.getByText("Estado del case cambiado");

  // OPEN: only itself + IN_PROGRESS.
  await expect(status.locator("option")).toHaveText(["Abierto", "En curso"]);

  await status.selectOption({ label: "En curso" });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(changedActivity).toHaveCount(1);
  // IN_PROGRESS: itself + WAITING + RESOLVED (auto-retries until the
  // Server Action's client-side refresh has landed — no manual reload,
  // which would just as happily read the page before the mutation commits).
  await expect(status.locator("option")).toHaveText(["En curso", "En espera", "Resuelto"]);

  await status.selectOption({ label: "En espera" });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(changedActivity).toHaveCount(2);
  await expect(status.locator("option")).toHaveText(["En espera", "En curso", "Resuelto"]);

  await status.selectOption({ label: "Resuelto" });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(changedActivity).toHaveCount(3);
  // RESOLVED: itself + reopen (IN_PROGRESS) + CLOSED.
  await expect(status.locator("option")).toHaveText(["Resuelto", "En curso", "Cerrado"]);

  await status.selectOption({ label: "Cerrado" });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(changedActivity).toHaveCount(4);
  // CLOSED is terminal: no other option offered at all.
  await expect(status.locator("option")).toHaveText(["Cerrado"]);
});

test("a case can only be assigned to a DELEGATE, never the ADMIN who created it", async ({ page, browser }) => {
  const adminName = `Admin ${randomUUID().slice(0, 8)}`;
  const delegateName = `Delegate ${randomUUID().slice(0, 8)}`;
  const contactName = `Contact ${randomUUID().slice(0, 8)}`;
  const caseTitle = `Case ${randomUUID().slice(0, 8)}`;

  await register(page, adminName);
  await createContact(page, contactName);
  await inviteAndAccept(page, browser, delegateName);

  await createCase(page, contactName, caseTitle);
  const assignedTo = page.getByLabel("Asignar a");
  await expect(assignedTo.locator("option")).toHaveText(["Sin asignar", delegateName]);

  await assignedTo.selectOption({ label: delegateName });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Case asignado")).toBeVisible();
});

test("link and unlink a conversation from the case page", async ({ page, request }) => {
  const delegateName = `Delegate ${randomUUID().slice(0, 8)}`;
  const contactName = `Ada ${randomUUID().slice(0, 8)}`;
  const caseTitle = `Case ${randomUUID().slice(0, 8)}`;

  await register(page, delegateName);

  // Connect the fake channel and receive one inbound message — it creates
  // its own Contact + Conversation (PKG-004). Opening a Case for that same
  // Contact means the Case and the Conversation already share a Contact, no
  // SQL bypass needed (unlike contact-assignments.spec.ts, which needs two
  // delegates on the *same* Contact and has no other way to get there).
  await page.goto("/organization/channels");
  await page.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();

  const [account] = await sql`
    select id from messaging_accounts
    where channel = 'fake' and delegate_id = (select id from users where name = ${delegateName})
    order by created_at desc limit 1
  `;
  expect(account).toBeTruthy();

  const webhookResponse = await request.post(`/api/webhooks/fake/${account.id}`, {
    headers: { "x-fake-signature": "fake-shared-secret" },
    data: JSON.stringify({
      externalConversationId: `chat-${randomUUID()}`,
      externalMessageId: `msg-${randomUUID()}`,
      externalContactId: `provider-${randomUUID()}`,
      contactDisplayName: contactName,
      text: "Necesito ayuda",
    }),
  });
  expect(webhookResponse.status()).toBe(200);

  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByText(contactName)).toBeVisible();
  }).toPass({ timeout: 15_000 });

  await createCase(page, contactName, caseTitle);

  await expect(page.getByText("Sin conversaciones vinculadas")).toBeVisible();
  const linkSelect = page.getByLabel("Conversación a vincular");
  await expect(linkSelect.locator("option").last()).toHaveText("fake");
  await linkSelect.selectOption({ label: "fake" });
  await page.getByRole("button", { name: "Vincular" }).click();

  await expect(page.getByRole("button", { name: "Quitar" })).toBeVisible();
  await expect(page.getByLabel("Conversación a vincular")).toHaveCount(0);

  await page.getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByText("Sin conversaciones vinculadas")).toBeVisible();
  await expect(page.getByLabel("Conversación a vincular")).toBeVisible();
});
