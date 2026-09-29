import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * UI-10a (`docs/ui/CONVERSATION_WORKSPACE.md`): the conversation panel gains
 * a second column, the read-only "ficha del afiliado", next to the chat.
 * Happy path only — the sections' own content (casos, tareas, delegado de
 * referencia) is already covered by `contact-assignments.spec.ts` and the
 * integration suite; this spec covers the panel's own layout behaviour:
 * visible by default when anchored, foldable with a remembered preference,
 * and collapsing into tabs below `xl`.
 */

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

test.afterAll(async () => {
  await sql.end();
});

async function registerAndReachInbox(page: import("@playwright/test").Page, name: string) {
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

async function openAConversation(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, delegateName: string) {
  await page.goto("/organization/channels");
  await page.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();

  const [account] = await sql`
    select id from messaging_accounts
    where channel = 'fake' and delegate_id = (select id from users where name = ${delegateName})
    order by created_at desc limit 1
  `;

  const contactName = `Ficha ${randomUUID().slice(0, 8)}`;
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
  await page.getByText(contactName).click();
  await expect(page).toHaveURL(/\/inbox\/.+/);
  return contactName;
}

test("anchored (xl+): the ficha shows by default and folds with a preference that survives a reload", async ({
  page,
  request,
}) => {
  const delegateName = `Ficha Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachInbox(page, delegateName);
  await openAConversation(page, request, delegateName);

  // Default Playwright viewport (1280x720) is exactly the anchored
  // threshold (docs/ui/CHAT.md §5) — both columns render without a click.
  const ficha = page.getByRole("complementary", { name: "Ficha del afiliado" });
  await expect(ficha.getByRole("heading", { name: "Casos abiertos" })).toBeVisible();
  await expect(ficha.getByRole("heading", { name: "Tareas pendientes" })).toBeVisible();
  await expect(ficha.getByRole("heading", { name: "Otras conversaciones" })).toBeVisible();

  await page.getByRole("button", { name: "Plegar ficha del afiliado" }).click();
  await expect(ficha).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("complementary", { name: "Ficha del afiliado" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mostrar ficha del afiliado" })).toBeVisible();

  await page.getByRole("button", { name: "Mostrar ficha del afiliado" }).click();
  await expect(page.getByRole("complementary", { name: "Ficha del afiliado" })).toBeVisible();
});

test("below xl: chat and ficha are tabs of the same panel instead of two columns", async ({ page, request }) => {
  const delegateName = `Ficha Tabs Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachInbox(page, delegateName);
  await page.setViewportSize({ width: 900, height: 800 });
  await openAConversation(page, request, delegateName);

  const thread = page.getByRole("log", { name: "Mensajes" });
  await expect(thread.getByText("Necesito ayuda")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ficha" })).toBeVisible();
  // No fold button below `xl` — collapsing only makes sense when there is a
  // second column to collapse (docs/ui/CONVERSATION_WORKSPACE.md §2).
  await expect(page.getByRole("button", { name: "Plegar ficha del afiliado" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Ficha" }).click();
  await expect(page.getByRole("heading", { name: "Casos abiertos" })).toBeVisible();
  await expect(thread).not.toBeVisible();
});
