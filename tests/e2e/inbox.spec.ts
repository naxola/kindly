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

/**
 * Walks the coexistence onboarding (PKG-008) from /channels to a connected
 * account: choose the coexistence path, acknowledge every preflight check,
 * and submit.
 */
async function connectCoexistenceChannel(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: "Conectar fake-coex", exact: true }).click();
  await page.getByRole("link", { name: "Siguiente" }).click();
  const checks = page.locator('input[name="acknowledged"]');
  // Wait for the step to actually render: counting straight after the click
  // resolves to 0 and silently ticks nothing.
  await expect(checks.first()).toBeVisible();
  for (let index = 0, total = await checks.count(); index < total; index++) {
    await checks.nth(index).check();
  }
  await page.getByRole("button", { name: "Continuar con Facebook" }).click();
  await expect(page).toHaveURL(/\/channels$/);
}

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
  await page.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();

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
  // PKG-013: shown at once, composer emptied, then confirmed with one tick.
  await expect(page.getByText("Claro, cuéntame más")).toBeVisible();
  await expect(page.getByPlaceholder("Escribe una respuesta...")).toHaveValue("");
  await expect(page.getByRole("img", { name: "Enviado" })).toBeVisible();

  // PKG-013: the open conversation picks up the delivery receipt and a new
  // inbound message by itself — no reload.
  const [sent] = await sql`
    select external_message_id from messages
    where messaging_account_id = ${account.id} and direction = 'OUTBOUND'
    order by created_at desc limit 1
  `;
  const [conversationRow] = await sql`
    select external_conversation_id from conversations where messaging_account_id = ${account.id} limit 1
  `;
  const receipts = await request.post(`/api/webhooks/fake/${account.id}`, {
    headers: { "x-fake-signature": "fake-shared-secret" },
    data: JSON.stringify([
      { kind: "DELIVERY_UPDATE", externalMessageId: sent.external_message_id, deliveryStatus: "DELIVERED" },
      {
        externalConversationId: conversationRow.external_conversation_id,
        externalMessageId: `msg-${randomUUID()}`,
        externalContactId: `provider-${randomUUID()}`,
        text: "Gracias, te escribo los detalles",
      },
    ]),
  });
  expect(receipts.status()).toBe(200);
  await expect(page.getByText("Gracias, te escribo los detalles")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("img", { name: "Entregado" })).toBeVisible({ timeout: 15_000 });
});

/**
 * PKG-005: on a coexistence channel the delegate can write from their own
 * phone, and the provider echoes that message back to us. It has to show up
 * in the Inbox as an outgoing message, marked as written on the phone
 * rather than composed in Kindly.
 */
test("a message the delegate wrote on their phone shows up in the Inbox as sent from the device", async ({
  page,
  request,
}) => {
  const delegateName = `Echo Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachDashboard(page, delegateName);

  await page.getByRole("link", { name: "Canales" }).click();
  await page.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();

  const [account] = await sql`
    select id from messaging_accounts
    where channel = 'fake' and delegate_id = (select id from users where name = ${delegateName})
    order by created_at desc limit 1
  `;
  expect(account).toBeTruthy();

  // No inbound message first: the delegate started this chat themselves, so
  // the echo is the very first thing Kindly ever sees of it.
  const contactName = `Grace ${randomUUID().slice(0, 8)}`;
  const echoResponse = await request.post(`/api/webhooks/fake/${account.id}`, {
    headers: { "x-fake-signature": "fake-shared-secret" },
    data: JSON.stringify({
      kind: "OUTBOUND_ECHO",
      externalConversationId: `chat-${randomUUID()}`,
      externalMessageId: `msg-${randomUUID()}`,
      externalContactId: `provider-${randomUUID()}`,
      contactDisplayName: contactName,
      text: "Te confirmo la cita mañana",
    }),
  });
  expect(echoResponse.status()).toBe(200);

  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByText(contactName)).toBeVisible();
  }).toPass({ timeout: 15_000 });

  await page.getByText(contactName).click();
  await expect(page).toHaveURL(/\/inbox\/.+/);
  await expect(page.getByText("Te confirmo la cita mañana")).toBeVisible();
  await expect(page.getByText("desde el móvil")).toBeVisible();
});

/**
 * PKG-005: on a channel with a provider messaging window (coexistence's
 * 24h), a conversation whose last inbound message is older than the window
 * cannot be replied to in free form — and the UI has to say why, including
 * the part users get wrong: writing from the phone does not reopen it.
 */
test("a conversation outside the provider window explains itself instead of offering a composer", async ({
  page,
  request,
}) => {
  const delegateName = `Window Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachDashboard(page, delegateName);

  await page.getByRole("link", { name: "Canales" }).click();
  // fake-coex declares the WhatsApp coexistence onboarding, so connecting
  // it means walking the flow rather than pressing one button (PKG-008).
  await connectCoexistenceChannel(page);
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();

  // This channel cannot be ended from Kindly, so no button is offered.
  await expect(page.getByText("Este canal se desconecta desde tu propio móvil")).toBeVisible();
  await expect(page.getByRole("button", { name: "Desconectar" })).toHaveCount(0);

  const [account] = await sql`
    select id from messaging_accounts
    where channel = 'fake-coex' and delegate_id = (select id from users where name = ${delegateName})
    order by created_at desc limit 1
  `;
  expect(account).toBeTruthy();

  // A message from the Contact 48h ago: the window opened then, and closed.
  const contactName = `Katherine ${randomUUID().slice(0, 8)}`;
  const staleAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const response = await request.post(`/api/webhooks/fake-coex/${account.id}`, {
    headers: { "x-fake-signature": "fake-shared-secret" },
    data: JSON.stringify({
      kind: "HISTORY_MESSAGE",
      externalConversationId: `chat-${randomUUID()}`,
      externalMessageId: `msg-${randomUUID()}`,
      externalContactId: `provider-${randomUUID()}`,
      contactDisplayName: contactName,
      direction: "INBOUND",
      text: "Escribí hace dos días",
      occurredAt: staleAt,
    }),
  });
  expect(response.status()).toBe(200);

  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByText(contactName)).toBeVisible();
  }).toPass({ timeout: 15_000 });

  await page.getByText(contactName).click();
  await expect(page.getByText("No puedes responder en texto libre ahora mismo")).toBeVisible();
  await expect(page.getByText("no reabren")).toBeVisible();
  await expect(page.getByPlaceholder("Escribe una respuesta...")).toHaveCount(0);
});

test("a second organization sees none of the first organization's inbox", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const delegateName = `Isolated Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachDashboard(pageA, delegateName);

  await pageA.getByRole("link", { name: "Canales" }).click();
  await pageA.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(pageA.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();
  await contextA.close();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await registerAndReachDashboard(pageB, "Org B User");

  await pageB.getByRole("link", { name: "Canales" }).click();
  await expect(pageB.getByText("Todavía no has conectado ningún canal.")).toBeVisible();
  await expect(pageB.getByText(delegateName)).toHaveCount(0);

  await pageB.getByRole("link", { name: "Inbox" }).click();
  await expect(pageB.getByText("Todavía no hay conversaciones.")).toBeVisible();
  await contextB.close();
});
