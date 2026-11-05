import "dotenv/config";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expectNoSeriousAccessibilityViolations } from "./axe-helpers";

/**
 * Fase 8 — the Copilot card in an open conversation: generate on request,
 * show the sources with their vigencia, "Usar como borrador" only fills the
 * composer (nothing is sent), "Descartar", and a clear abstention when there
 * is no evidence. Runs with the deterministic fake LLM and embeddings
 * (`E2E_FAKE_LLM`, `E2E_FAKE_EMBEDDINGS`, see `playwright.config.ts`).
 */

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

test.afterAll(async () => {
  await sql.end();
});

async function register(page: Page, name: string) {
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByPlaceholder("Email").fill(`${randomUUID()}@example.com`);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
}

async function uploadKnowledge(page: Page, title: string, text: string) {
  await page.goto("/knowledge");
  await page.getByRole("button", { name: "Añadir conocimiento" }).click();
  const picker = page.getByRole("dialog", { name: "Añadir conocimiento" });
  await picker.getByLabel("Tipo de conocimiento").selectOption("DOCUMENT");
  await picker.getByRole("button", { name: "Continuar" }).click();
  const dialog = page.getByRole("dialog", { name: "Añadir documento" });
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByLabel("Jurisdicción").fill("ES");
  await dialog.getByLabel("Origen").selectOption("TEXT");
  await dialog.getByLabel("Archivo").setInputFiles({ name: "doc.txt", mimeType: "text/plain", buffer: Buffer.from(text) });
  await dialog.getByLabel("Versión", { exact: true }).fill("2024");
  await dialog.getByLabel("En vigor desde").fill("2024-01-10");
  await dialog.getByLabel("Nota de fuente").fill("BOE núm. 5");
  await dialog.getByRole("button", { name: "Subir documento" }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

async function connectChannel(page: Page, delegateName: string) {
  await page.goto("/organization/channels");
  await page.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();
  const [account] = await sql`
    select id from messaging_accounts
    where channel = 'fake' and delegate_id = (select id from users where name = ${delegateName})
    order by created_at desc limit 1`;
  return account.id as string;
}

async function receive(request: APIRequestContext, accountId: string, chatId: string, contactName: string, text: string) {
  const response = await request.post(`/api/webhooks/fake/${accountId}`, {
    headers: { "x-fake-signature": "fake-shared-secret" },
    data: JSON.stringify({
      externalConversationId: chatId,
      externalMessageId: `msg-${randomUUID()}`,
      externalContactId: `provider-${chatId}`,
      contactDisplayName: contactName,
      text,
    }),
  });
  expect(response.status()).toBe(200);
}

async function openConversation(page: Page, contactName: string) {
  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByText(contactName)).toBeVisible();
  }).toPass({ timeout: 15_000 });
  await page.getByText(contactName).click();
  await expect(page).toHaveURL(/\/inbox\?(.*&)?conversation=/);
}

async function outboundCount(conversationName: string): Promise<number> {
  const [row] = await sql`
    select count(*)::int as n from messages m
    join conversations c on c.id = m.conversation_id
    join contacts k on k.id = c.contact_id
    where k.name = ${conversationName} and m.direction = 'OUTBOUND'`;
  return row.n;
}

test("the card suggests a grounded reply with its sources; using it only fills the composer, nothing is sent; it can be discarded", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const delegate = `Copilot ${suffix}`;
  await register(page, delegate);
  const title = `Protocolo bajas ${suffix}`;
  await uploadKnowledge(page, title, `Artículo 1. La tramitacion${suffix} de la baja requiere el parte médico original.`);

  const accountId = await connectChannel(page, delegate);
  const contactName = `Marta ${suffix}`;
  await receive(request, accountId, `chat-${suffix}`, contactName, `Cómo es la tramitacion${suffix} de mi baja`);
  await openConversation(page, contactName);

  const card = page.getByRole("region", { name: "Copiloto" });
  await expect(card.getByText("Pide una sugerencia para la última intervención de la persona.")).toBeVisible();
  await expect(card.getByText("Nada se envía sin que lo revises tú.")).toBeVisible();

  await card.getByRole("button", { name: "Sugerir respuesta" }).click();
  await expect(card.getByText("Evidencia parcial")).toBeVisible();
  await expect(card.getByText("Hola, según la documentación, lo revisamos y te confirmamos.")).toBeVisible();

  // Sources with provenance: document, version, vigencia, and a link to the document.
  const source = card.getByRole("listitem").filter({ hasText: title });
  await source.getByText(title).click();
  await expect(source.getByText(/Versión 2024/)).toBeVisible();
  await expect(source.getByText(/Desde/)).toBeVisible();
  await expect(source.getByText("BOE núm. 5")).toBeVisible();
  await expect(source.getByRole("link", { name: "Abrir el documento" })).toHaveAttribute("href", /\/knowledge\//);

  await expectNoSeriousAccessibilityViolations(page, "tarjeta del copiloto con sugerencia");

  // There is no way to send it from the card.
  await expect(card.getByRole("button", { name: /enviar/i })).toHaveCount(0);

  const composer = page.getByPlaceholder("Escribe una respuesta...");
  await card.getByRole("button", { name: "Usar como borrador" }).click();
  await expect(composer).toHaveValue("Hola, según la documentación, lo revisamos y te confirmamos.");
  await expect(composer).toBeFocused();
  await expect(card.getByText("La última sugerencia se usó como borrador.")).toBeVisible();
  expect(await outboundCount(contactName)).toBe(0);

  // The professional edits and sends themselves.
  await composer.fill("Hola Marta, necesito tu parte médico original.");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("log", { name: "Mensajes" }).getByText("Hola Marta, necesito tu parte médico original.")).toBeVisible();
  await expect.poll(() => outboundCount(contactName)).toBe(1);

  // A new suggestion, discarded.
  await card.getByRole("button", { name: "Sugerir de nuevo" }).click();
  // The 10 s cooldown applies per conversation: wait for it, then discard what comes back.
  await expect(card.getByText(/Espera unos segundos/)).toBeVisible();
  await page.waitForTimeout(10_500);
  await card.getByRole("button", { name: "Reintentar" }).click();
  await expect(card.getByRole("button", { name: "Descartar" })).toBeVisible();
  await card.getByRole("button", { name: "Descartar" }).click();
  await expect(card.getByText("La última sugerencia se descartó.")).toBeVisible();
  expect(await outboundCount(contactName)).toBe(1);
});

test("with no evidence the card abstains: no draft, no 'Usar como borrador', and it says what is missing", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const delegate = `Abstain ${suffix}`;
  await register(page, delegate);
  const accountId = await connectChannel(page, delegate);
  const contactName = `Luis ${suffix}`;
  await receive(request, accountId, `chat-${suffix}`, contactName, "¿Cuántos días de vacaciones me corresponden?");
  await openConversation(page, contactName);

  const card = page.getByRole("region", { name: "Copiloto" });
  await card.getByRole("button", { name: "Sugerir respuesta" }).click();

  await expect(card.getByText("No hay evidencia suficiente para proponer una respuesta")).toBeVisible();
  await expect(card.getByText("Evidencia insuficiente")).toBeVisible();
  await expect(card.getByText("No hay documentación cargada sobre este asunto.")).toBeVisible();
  await expect(card.getByText("Tienes 30 días.")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Usar como borrador" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Escribe una respuesta...")).toHaveValue("");

  await expectNoSeriousAccessibilityViolations(page, "tarjeta del copiloto con abstención");
  await card.getByRole("button", { name: "Descartar" }).click();
  await expect(card.getByText("La última sugerencia se descartó.")).toBeVisible();
});

test("using a suggestion over an existing draft asks before replacing it, and a new message flags the suggestion as stale", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const delegate = `Stale ${suffix}`;
  await register(page, delegate);
  const accountId = await connectChannel(page, delegate);
  const contactName = `Ana ${suffix}`;
  const chatId = `chat-${suffix}`;
  await receive(request, accountId, chatId, contactName, "Hola, buenas tardes");
  await openConversation(page, contactName);

  const card = page.getByRole("region", { name: "Copiloto" });
  const composer = page.getByPlaceholder("Escribe una respuesta...");
  await composer.fill("Un borrador mío");
  await card.getByRole("button", { name: "Sugerir respuesta" }).click();
  await expect(card.getByText("No requiere normativa")).toBeVisible();

  await card.getByRole("button", { name: "Usar como borrador" }).click();
  const dialog = page.getByRole("dialog", { name: "Reemplazar el borrador actual" });
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(composer).toHaveValue("Un borrador mío");

  // A new inbound message arrives while the suggestion is open: the thread polls, the card flags it.
  await receive(request, accountId, chatId, contactName, "Otra pregunta más");
  await expect(card.getByText("Ha llegado un mensaje nuevo desde esta sugerencia")).toBeVisible({ timeout: 15_000 });

  await card.getByRole("button", { name: "Usar como borrador" }).click();
  await page.getByRole("dialog", { name: "Reemplazar el borrador actual" }).getByRole("button", { name: "Reemplazar" }).click();
  await expect(composer).toHaveValue(/Hola, gracias por escribir/);
});
