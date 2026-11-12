import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expectNoSeriousAccessibilityViolations } from "./axe-helpers";

/**
 * UI-8 (`docs/ui/ROADMAP.md` "Fase 8"): `@axe-core/playwright` against the
 * flows the roadmap names — Inbox (empty and with an open conversation,
 * chat + ficha), Organización — for both light and dark theme, since
 * neither is more likely than the other to introduce a serious/critical
 * violation and the check is cheap to repeat.
 */

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

test.afterAll(async () => {
  await sql.end();
});

async function register(page: import("@playwright/test").Page, name: string) {
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByPlaceholder("Email").fill(`${randomUUID()}@example.com`);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test(`Inbox, an open conversation, and Organización have no serious accessibility violations`, async ({
      page,
      request,
    }) => {
      const delegateName = `Axe ${theme} ${randomUUID().slice(0, 8)}`;
      await register(page, delegateName);

      // Empty Inbox.
      await expectNoSeriousAccessibilityViolations(page, `/inbox (vacío, ${theme})`);

      // Connect the fake channel and receive a message so there is a real
      // conversation (chat + ficha, UI-10a/b) to audit, not an empty state.
      await page.goto("/organization/channels");
      await page.getByRole("button", { name: "Conectar fake", exact: true }).click();
      await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();

      const [account] = await sql`
        select id from messaging_accounts
        where channel = 'fake' and delegate_id = (select id from users where name = ${delegateName})
        order by created_at desc limit 1
      `;
      expect(account).toBeTruthy();

      const contactName = `Ada ${randomUUID().slice(0, 8)}`;
      const webhookResponse = await request.post(`/api/webhooks/fake/${account.id}`, {
        headers: { "x-fake-signature": "fake-shared-secret" },
        data: JSON.stringify({
          externalConversationId: `chat-${randomUUID()}`,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: `provider-${randomUUID()}`,
          contactDisplayName: contactName,
          text: "Necesito ayuda con mi caso",
        }),
      });
      expect(webhookResponse.status()).toBe(200);

      await expect(async () => {
        await page.goto("/inbox");
        await expect(page.getByText(contactName)).toBeVisible();
      }).toPass({ timeout: 15_000 });
      await expectNoSeriousAccessibilityViolations(page, `/inbox (con conversaciones, ${theme})`);

      await page.getByText(contactName).click();
      await expect(page).toHaveURL(/\/inbox\?(.*&)?conversation=/);
      const thread = page.getByRole("log", { name: "Mensajes" });
      await expect(thread.getByText("Necesito ayuda con mi caso")).toBeVisible();

      // A reply renders the delivery ticks (PKG-013) — part of the surface
      // to audit, not just the bare inbound message.
      await page.getByPlaceholder("Escribe una respuesta...").fill("Claro, cuéntame más");
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(thread.getByRole("img", { name: "Enviado" })).toBeVisible();

      await expectNoSeriousAccessibilityViolations(page, `conversación abierta (chat + ficha, ${theme})`);

      // Organización.
      await page.getByRole("link", { name: "Organización", exact: true }).click();
      await expect(page).toHaveURL(/\/organization$/);
      await expectNoSeriousAccessibilityViolations(page, `/organization (${theme})`);
    });
  });
}
