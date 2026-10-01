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
  await expect(page).toHaveURL(/\/inbox\?(.*&)?conversation=/);
  return contactName;
}

/**
 * Any route render — a document load, or a real (non-prefetch) RSC
 * navigation — would mean the Inbox went back to the server. Link
 * prefetches are not counted: the sidebar/header links (including the one
 * to `/inbox` itself) prefetch on their own schedule, and a prefetch never
 * renders anything. The Inbox's own data (`/api/...`) is expected.
 */
function recordRouteRequests(page: import("@playwright/test").Page): string[] {
  const routeRequests: string[] = [];
  page.on("request", (req) => {
    const headers = req.headers();
    if (req.resourceType() === "document" || (headers["rsc"] && !headers["next-router-prefetch"])) {
      routeRequests.push(req.url());
    }
  });
  return routeRequests;
}

interface WidthSample {
  panel: number;
  list: number;
  panelScrollLeft: number;
  pageScrollX: number;
}

/** Starts recording, every animation frame, the panel's and the list's rendered widths. */
async function startSamplingWidths(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const probe = window as unknown as { __samples: WidthSample[]; __sampling: boolean };
    probe.__samples = [];
    probe.__sampling = true;
    function sample() {
      const panel = document.querySelector("[data-conversation-panel]");
      const list = document.querySelector('ul[aria-label="Conversaciones"]');
      if (panel && list) {
        probe.__samples.push({
          panel: Math.round(panel.getBoundingClientRect().width),
          list: Math.round(list.getBoundingClientRect().width),
          panelScrollLeft: panel.scrollLeft,
          pageScrollX: window.scrollX,
        });
      }
      if (probe.__sampling) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}

async function stopSamplingWidths(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const probe = window as unknown as { __samples: WidthSample[]; __sampling: boolean };
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
  // Nothing ever scrolls sideways — not the panel (it used to be left
  // offset after opening: left border gone, ficha peeking at the right),
  // not the page (a one-frame jolt that read as a reload).
  expect(samples.every((s) => s.panelScrollLeft === 0 && s.pageScrollX === 0)).toBe(true);

  // Same with the ficha folded: the panel ends at chat width, not offset.
  await page.getByRole("list", { name: "Conversaciones" }).getByText(contactName).click();
  await page.getByRole("button", { name: "Plegar ficha del afiliado" }).click();
  await page.getByRole("button", { name: "Cerrar conversación" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await page.waitForTimeout(500);
  await startSamplingWidths(page);
  await page.getByRole("list", { name: "Conversaciones" }).getByText(contactName).click();
  await page.waitForTimeout(500);
  const folded = await stopSamplingWidths(page);
  expect(folded.every((s) => s.panelScrollLeft === 0 && s.pageScrollX === 0)).toBe(true);
});

test("opening, closing and the back button never reload the page or the list from the server", async ({
  page,
  request,
}) => {
  const delegateName = `Ficha NoReload Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachInbox(page, delegateName);
  const contactName = await createAConversation(page, request, delegateName);

  const routeRequests = recordRouteRequests(page);
  await page.evaluate(() => {
    document.querySelector('ul[aria-label="Conversaciones"]')!.setAttribute("data-probe", "same-list");
  });

  const ficha = page.getByRole("complementary", { name: "Ficha del afiliado" });
  // Scoped to the list: while the panel slides closed, its header still
  // shows the same name.
  const row = page.getByRole("list", { name: "Conversaciones" }).getByText(contactName);
  await row.click();
  await expect(page).toHaveURL(/\/inbox\?(.*&)?conversation=/);
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
  await expect(page).toHaveURL(/\/inbox\?(.*&)?conversation=/);
  await expect(ficha).toBeVisible();

  expect(routeRequests).toEqual([]);
  await expect(page.locator('ul[aria-label="Conversaciones"][data-probe="same-list"]')).toHaveCount(1);
});

test("filtering the list is client state too: no page request, and back restores the previous filter", async ({
  page,
  request,
}) => {
  const delegateName = `Ficha Filter Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachInbox(page, delegateName);
  const contactName = await createAConversation(page, request, delegateName);

  const routeRequests = recordRouteRequests(page);

  const list = page.getByRole("list", { name: "Conversaciones" });
  await page.getByLabel("Mostrar").selectOption("pending");
  await expect(page).toHaveURL(/\/inbox\?view=pending$/);
  await expect(list.getByText(contactName)).toBeVisible();

  await page.getByLabel("Buscar").fill("nadie-se-llama-asi");
  await expect(page.getByText("Ninguna conversación coincide con «nadie-se-llama-asi»")).toBeVisible();
  // The search box keeps focus while its debounced value lands in the URL.
  await expect(page.getByLabel("Buscar")).toBeFocused();

  await page.getByRole("button", { name: "Quitar filtros" }).first().click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(list.getByText(contactName)).toBeVisible();

  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(/view=pending/);
  await expect(page.getByLabel("Mostrar")).toHaveValue("pending");

  expect(routeRequests).toEqual([]);
});

test("a conversation that fails to load offers a retry instead of hanging on a skeleton", async ({ page, request }) => {
  const delegateName = `Ficha Retry Delegate ${randomUUID().slice(0, 8)}`;
  await registerAndReachInbox(page, delegateName);
  const contactName = await createAConversation(page, request, delegateName);

  await page.route("**/api/conversations/*/workspace", (route) => route.abort("internetdisconnected"));
  await page.getByRole("list", { name: "Conversaciones" }).getByText(contactName).click();
  await expect(page.getByText("No se pudo cargar la conversación")).toBeVisible({ timeout: 15_000 });

  await page.unroute("**/api/conversations/*/workspace");
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("log", { name: "Mensajes" }).getByText("Necesito ayuda")).toBeVisible();
  await expect(page.getByText("No se pudo cargar la conversación")).toHaveCount(0);
});
