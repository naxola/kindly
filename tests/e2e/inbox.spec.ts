import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * PKG-004 happy path (project/CURRENT_TASK.md): connect the fake channel
 * from /channels (only reachable because playwright.config.ts starts the
 * server with `E2E_FAKE_MESSAGING_CHANNEL=true`, see src/instrumentation.ts)
 * → simulate a real inbound webhook → see it in /inbox with the "Sin
 * identificar" badge and unread → open it → mark it identified → reply →
 * verify a second organization sees none of it.
 *
 * The webhook is posted directly with Playwright's `request` fixture (real
 * HTTP, same as a provider would do) instead of through the UI — there is
 * no UI for a provider sending a message. Reading `DATABASE_URL` directly
 * (via `dotenv/config`, no TEST_DATABASE_URL redirect) to look up the
 * MessagingAccount id: the running server (started by webServer) and this
 * test talk to the same database, same as every other e2e spec today.
 */

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

test.afterAll(async () => {
  await sql.end();
});

async function registerAndReachDashboard(page: import("@playwright/test").Page, name: string) {
  const email = `${randomUUID()}@example.com`;
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

test("connect the fake channel, receive a message, identify it, and reply", async ({ page, request }) => {
  const delegateName = `Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachDashboard(page, delegateName);

  // Connect the fake channel to this newly registered delegate.
  await page.getByRole("link", { name: "Canales" }).click();
  await expect(page).toHaveURL(/\/channels$/);
  await page.getByLabel("Canal").selectOption({ label: "fake" });
  await page.getByLabel("Delegate").selectOption({ label: delegateName });
  await page.getByRole("button", { name: "Conectar" }).click();
  await expect(page.getByText("CONNECTED")).toBeVisible();

  const [account] = await sql`
    select id from messaging_accounts
    where channel = 'fake' and delegate_id = (select id from users where name = ${delegateName})
    order by created_at desc limit 1
  `;
  expect(account).toBeTruthy();

  // Simulate a real inbound webhook from an unknown sender.
  const externalMessageId = `msg-${randomUUID()}`;
  const contactName = `Ada ${randomUUID().slice(0, 8)}`;
  const webhookResponse = await request.post(`/api/webhooks/fake/${account.id}`, {
    headers: { "x-fake-signature": "fake-shared-secret" },
    data: JSON.stringify({
      externalConversationId: `chat-${randomUUID()}`,
      externalMessageId,
      externalContactId: `provider-${randomUUID()}`,
      contactDisplayName: contactName,
      text: "Necesito ayuda con mi caso",
    }),
  });
  expect(webhookResponse.status()).toBe(200);

  // Webhook processing runs in next/server's after(), asynchronously —
  // poll the Inbox until it shows up instead of assuming it's instant.
  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByText(contactName)).toBeVisible();
  }).toPass({ timeout: 15_000 });

  await expect(page.getByText("Sin identificar")).toBeVisible();

  await page.getByText(contactName).click();
  await expect(page).toHaveURL(/\/inbox\/.+/);
  await expect(page.getByText("Necesito ayuda con mi caso")).toBeVisible();
  await expect(page.getByText("Contact no identificado")).toBeVisible();

  await page.getByRole("button", { name: "Marcar como identificado" }).click();
  await expect(page.getByText("Contact no identificado")).toHaveCount(0);

  // Back in the list, the unread dot and the badge are both gone.
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText("Sin identificar")).toHaveCount(0);
  await expect(page.getByText(contactName)).not.toHaveClass(/font-semibold/);

  // Reply from the conversation.
  await page.getByText(contactName).click();
  await page.getByPlaceholder("Escribe una respuesta...").fill("Claro, cuéntame más");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Claro, cuéntame más")).toBeVisible();
  await expect(page.getByText("SENT")).toBeVisible();
});

test("a second organization sees none of the first organization's inbox", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const delegateName = `Isolated Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachDashboard(pageA, delegateName);

  await pageA.getByRole("link", { name: "Canales" }).click();
  await pageA.getByLabel("Canal").selectOption({ label: "fake" });
  await pageA.getByLabel("Delegate").selectOption({ label: delegateName });
  await pageA.getByRole("button", { name: "Conectar" }).click();
  await expect(pageA.getByText("CONNECTED")).toBeVisible();
  await contextA.close();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await registerAndReachDashboard(pageB, "Org B User");

  await pageB.getByRole("link", { name: "Canales" }).click();
  await expect(pageB.getByText("Todavía no hay canales conectados.")).toBeVisible();
  await expect(pageB.getByText(delegateName)).toHaveCount(0);

  await pageB.getByRole("link", { name: "Inbox" }).click();
  await expect(pageB.getByText("Todavía no hay conversaciones.")).toBeVisible();
  await contextB.close();
});
