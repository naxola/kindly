import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expectNoSeriousAccessibilityViolations } from "./axe-helpers";

/**
 * UI-10c: a file a member sends shows in the thread as "Archivo no guardado
 * en Kindly · Descargar"; downloading streams it from the provider (fake
 * channel here) without Kindly keeping a copy; an expired one says so; and
 * the delegate can insert the documents notice in the composer (nothing is
 * sent until they press Enviar).
 */

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

test.use({ viewport: { width: 1600, height: 900 } });

test.afterAll(async () => {
  await sql.end();
});

test("a delegate sees a member's file, downloads it, and inserts the documents notice", async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const delegateName = `Adjunto ${suffix}`;
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(delegateName);
  await page.getByPlaceholder("Email").fill(`${randomUUID()}@example.com`);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);

  await page.goto("/organization/channels");
  await page.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();
  const [account] = await sql`
    select id from messaging_accounts
    where channel = 'fake' and delegate_id = (select id from users where name = ${delegateName})
    order by created_at desc limit 1`;

  const contactName = `Persona ${suffix}`;
  const chat = `chat-${randomUUID()}`;
  const contactId = `provider-${randomUUID()}`;
  const send = async (data: Record<string, unknown>) => {
    const response = await request.post(`/api/webhooks/fake/${account.id}`, {
      headers: { "x-fake-signature": "fake-shared-secret" },
      data: JSON.stringify({
        externalConversationId: chat,
        externalContactId: contactId,
        contactDisplayName: contactName,
        externalMessageId: `msg-${randomUUID()}`,
        ...data,
      }),
    });
    expect(response.status()).toBe(200);
  };
  await send({
    text: "Mi pasaporte",
    attachment: { kind: "DOCUMENT", mediaId: "media-pasaporte", mimeType: "application/pdf", filename: "Pasaporte.pdf" },
  });
  await send({ text: "", attachment: { kind: "IMAGE", mediaId: "expired-foto", mimeType: "image/jpeg" } });

  await expect(async () => {
    await page.goto("/inbox");
    await expect(page.getByText(contactName)).toBeVisible();
  }).toPass({ timeout: 15_000 });
  await page.getByText(contactName).click();

  // The document: its caption, the file box, and the promise that Kindly keeps nothing.
  await expect(page.getByText("Mi pasaporte")).toBeVisible();
  await expect(page.getByText("Documento: Pasaporte.pdf")).toBeVisible();
  await expect(page.getByText("Archivo no guardado en Kindly").first()).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, "/inbox con un adjunto");

  // Downloading streams it from the provider; the browser receives the file.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Pasaporte.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe("Contenido simulado del archivo media-pasaporte");

  // The file itself is nowhere in the database; only its descriptor is.
  const rows = await sql`select body, attachment from messages where conversation_id in (select id from conversations where external_conversation_id = ${chat})`;
  expect(JSON.stringify(rows)).not.toContain("Contenido simulado");
  expect(rows.find((r) => r.attachment?.mediaId === "media-pasaporte")?.attachment).toMatchObject({ kind: "DOCUMENT", filename: "Pasaporte.pdf" });

  // The image the provider no longer has: the box says so instead of offering a broken download.
  await expect(page.getByText("Imagen", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Descargar" }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: "ya no está disponible" })).toBeVisible();

  // The documents notice goes to the composer; nothing is sent until the delegate presses Enviar.
  const composer = page.getByPlaceholder("Escribe una respuesta...");
  await page.getByRole("button", { name: "Insertar aviso de documentos" }).click();
  await expect(composer).toHaveValue(/Kindly no guarda los documentos que envías/);
  await expect(composer).toBeFocused();
  const [{ outbound }] = await sql`
    select count(*)::int as outbound from messages
    where direction = 'OUTBOUND' and conversation_id in (select id from conversations where external_conversation_id = ${chat})`;
  expect(outbound).toBe(0);
});
