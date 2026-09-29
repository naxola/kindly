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

/** Connects the fake channel and gets one conversation showing in the list, without opening it. */
async function createAConversation(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  delegateName: string,
) {
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
  return contactName;
}

async function openAConversation(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, delegateName: string) {
  const contactName = await createAConversation(page, request, delegateName);
  await page.getByText(contactName).click();
  await expect(page).toHaveURL(/\/inbox\/.+/);
  return contactName;
}

/** Starts recording, every animation frame, the panel's and the list's rendered widths. */
async function startSamplingWidths(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const probe = window as unknown as { __samples: { panel: number; list: number }[]; __sampling: boolean };
    probe.__samples = [];
    probe.__sampling = true;
    function sample() {
      const panel = document.querySelector("[data-conversation-panel]");
      const list = document.querySelector('ul[aria-label="Conversaciones"]');
      if (panel && list) {
        probe.__samples.push({
          panel: Math.round(panel.getBoundingClientRect().width),
          list: Math.round(list.getBoundingClientRect().width),
        });
      }
      if (probe.__sampling) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}

async function stopSamplingWidths(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const probe = window as unknown as { __samples: { panel: number; list: number }[]; __sampling: boolean };
    probe.__sampling = false;
    return probe.__samples;
  });
}

test("anchored (xl+): the ficha shows by default; folding it slides the chat right, and the preference survives a reload", async ({
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

  const thread = page.getByRole("log", { name: "Mensajes" });
  const chatLeftBefore = (await thread.boundingBox())!.x;
  await page.getByRole("button", { name: "Plegar ficha del afiliado" }).click();
  await expect(ficha).toHaveCount(0);
  // The chat takes the ficha's place at the right edge — it slides over,
  // it isn't left where it was with an empty gap next to it.
  await expect.poll(async () => (await thread.boundingBox())!.x).toBeGreaterThan(chatLeftBefore + 200);

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

test("anchored: opening and closing are one smooth width transition each way, with the list moving in lockstep", async ({
  page,
  request,
}) => {
  const delegateName = `Ficha Timing Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachInbox(page, delegateName);
  const contactName = await createAConversation(page, request, delegateName);

  await startSamplingWidths(page);
  await page.getByText(contactName).click();
  await expect(page.getByRole("complementary", { name: "Ficha del afiliado" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Cerrar conversación" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await page.waitForTimeout(500);
  const samples = await stopSamplingWidths(page);

  const panelWidths = samples.map((s) => s.panel);
  const widest = Math.max(...panelWidths);
  const peak = panelWidths.indexOf(widest);
  const intermediate = (widths: number[]) => new Set(widths.filter((w) => w > 0 && w < widest)).size;
  // Several distinct in-between widths on the way in *and* on the way out:
  // an animation, not a jump, in both directions (docs/ui/CHAT.md §5).
  expect(intermediate(panelWidths.slice(0, peak))).toBeGreaterThan(2);
  expect(intermediate(panelWidths.slice(peak))).toBeGreaterThan(2);
  expect(panelWidths.at(-1)).toBe(0);
  // Every frame, whatever the panel gains the list loses: one motion, not
  // two that happen to overlap.
  const totals = samples.map((s) => s.panel + s.list);
  expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(2);
});

test("opening, closing and the back button never reload the page or the list from the server", async ({
  page,
  request,
}) => {
  const delegateName = `Ficha NoReload Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachInbox(page, delegateName);
  const contactName = await createAConversation(page, request, delegateName);

  // Any route render — a document load, or an RSC fetch that isn't just a
  // link prefetching some *other* page — would mean the Inbox went back to
  // the server. The panel's own data (`/api/...`) is expected.
  const routeRequests: string[] = [];
  page.on("request", (req) => {
    const headers = req.headers();
    const isInboxRoute = new URL(req.url()).pathname.startsWith("/inbox");
    if (req.resourceType() === "document" || (headers["rsc"] && (isInboxRoute || !headers["next-router-prefetch"]))) {
      routeRequests.push(req.url());
    }
  });
  await page.evaluate(() => {
    document.querySelector('ul[aria-label="Conversaciones"]')!.setAttribute("data-probe", "same-list");
  });

  const ficha = page.getByRole("complementary", { name: "Ficha del afiliado" });
  // Scoped to the list: while the panel slides closed, its header still
  // shows the same name.
  const row = page.getByRole("list", { name: "Conversaciones" }).getByText(contactName);
  await row.click();
  await expect(page).toHaveURL(/\/inbox\/.+/);
  await expect(ficha).toBeVisible();

  await page.getByRole("button", { name: "Cerrar conversación" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(ficha).toHaveCount(0);

  await row.click();
  await expect(ficha).toBeVisible();
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(ficha).toHaveCount(0);
  await page.evaluate(() => window.history.forward());
  await expect(page).toHaveURL(/\/inbox\/.+/);
  await expect(ficha).toBeVisible();

  expect(routeRequests).toEqual([]);
  await expect(page.locator('ul[aria-label="Conversaciones"][data-probe="same-list"]')).toHaveCount(1);
});
