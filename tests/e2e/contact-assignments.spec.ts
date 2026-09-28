import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * PKG-014 UI, with two delegates (`docs/DECISIONS.md`, "Delegado de
 * referencia y acceso temporal"): Marta writes to Luis first (he becomes
 * her reference delegate), then also writes to Ana. Ana's Inbox row for
 * Marta is highlighted with "acceso temporal"; opening it explains who the
 * reference is but still lets her reply (it's her own number). An ADMIN
 * reassigns Marta to Ana from the Contact page, and the highlight moves.
 *
 * One Conversation can only ever be created by its own delegate's inbound
 * webhook (`findOrCreateConversation` never matches an existing Contact —
 * `docs/DECISIONS.md`), so Marta writing to *both* Ana and Luis needs a
 * second Conversation wired onto her Contact by hand, the same bypass
 * `tests/integration/contact-assignments.test.ts` uses for the same reason.
 */

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

test.afterAll(async () => {
  await sql.end();
});

async function register(page: import("@playwright/test").Page, name: string, email: string) {
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
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
  return { context, page };
}

async function connectFakeChannel(page: import("@playwright/test").Page, delegateName: string) {
  await page.goto("/organization/channels");
  await page.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();
  const [account] = await sql`
    select id from messaging_accounts
    where channel = 'fake' and delegate_id = (select id from users where name = ${delegateName})
    order by created_at desc limit 1
  `;
  return account.id as string;
}

test("acceso temporal: highlight, banner, reassign, and read-only across two delegates", async ({ browser, request }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const adminName = `Admin ${randomUUID().slice(0, 8)}`;
  await register(adminPage, adminName, `${randomUUID()}@example.com`);

  const luisName = `Luis ${randomUUID().slice(0, 8)}`;
  const anaName = `Ana ${randomUUID().slice(0, 8)}`;
  const { context: luisContext, page: luisPage } = await inviteAndAccept(adminPage, browser, luisName);
  const { context: anaContext, page: anaPage } = await inviteAndAccept(adminPage, browser, anaName);

  const luisAccountId = await connectFakeChannel(luisPage, luisName);
  const anaAccountId = await connectFakeChannel(anaPage, anaName);

  // Marta writes to Luis first — he becomes her reference delegate.
  const martaName = `Marta ${randomUUID().slice(0, 8)}`;
  const luisConversationExternalId = `chat-${randomUUID()}`;
  const webhook = await request.post(`/api/webhooks/fake/${luisAccountId}`, {
    headers: { "x-fake-signature": "fake-shared-secret" },
    data: JSON.stringify({
      externalConversationId: luisConversationExternalId,
      externalMessageId: `msg-${randomUUID()}`,
      externalContactId: `provider-${randomUUID()}`,
      contactDisplayName: martaName,
      text: "Hola Luis",
    }),
  });
  expect(webhook.status()).toBe(200);

  let contactId = "";
  let luisConversationId = "";
  await expect(async () => {
    const [row] = await sql`
      select c.id as conversation_id, c.contact_id
      from conversations c
      where c.messaging_account_id = ${luisAccountId} and c.external_conversation_id = ${luisConversationExternalId}
    `;
    expect(row).toBeTruthy();
    contactId = row.contact_id;
    luisConversationId = row.conversation_id;
  }).toPass({ timeout: 15_000 });

  // Marta also writes to Ana — wired directly, since the fake webhook
  // pipeline cannot attach a second Conversation to an existing Contact.
  const [anaConversation] = await sql`
    insert into conversations (organization_id, messaging_account_id, contact_id, channel, external_conversation_id)
    select organization_id, ${anaAccountId}, ${contactId}, 'fake', ${`chat-${randomUUID()}`}
    from conversations where id = ${luisConversationId}
    returning id, organization_id
  `;
  await sql`
    insert into messages (organization_id, conversation_id, messaging_account_id, external_message_id, direction, body, delivery_status)
    values (${anaConversation.organization_id}, ${anaConversation.id}, ${anaAccountId}, ${`msg-${randomUUID()}`}, 'INBOUND', 'Hola Ana', 'DELIVERED')
  `;

  // Ana's Inbox shows Marta's row with the reference delegate named — the
  // "Ref.: X" label only renders for a row under "acceso temporal"
  // (`InboxRow`). Being the reference delegate too, Luis's own Conversation
  // with Marta is visible to Ana as a second row ("todo el historial con
  // cualquier delegado") — so both `martaName` and the label can match more
  // than once; `.first()` only asserts presence, not uniqueness.
  await anaPage.goto("/inbox");
  const anaConversationList = anaPage.getByRole("list", { name: "Conversaciones" });
  await expect(anaConversationList.getByText(martaName).first()).toBeVisible();
  await expect(anaConversationList.getByText(`Ref.: ${luisName}`).first()).toBeVisible();

  // Opening Ana's own Conversation with Marta directly (the list now shows
  // two rows for her, ambiguous to click by name) explains the reference
  // delegate, but Ana can still reply — it's her own number.
  await anaPage.goto(`/inbox/${anaConversation.id}`);
  await expect(anaPage.getByText(`Su delegado de referencia es ${luisName}`)).toBeVisible();
  const anaComposer = anaPage.getByPlaceholder("Escribe una respuesta...");
  await expect(anaComposer).toBeVisible();
  await anaComposer.fill("Hola Marta, soy Ana");
  await anaPage.getByRole("button", { name: "Enviar" }).click();
  await expect(anaPage.getByRole("log", { name: "Mensajes" }).getByText("Hola Marta, soy Ana")).toBeVisible();

  // Luis's own Conversation is read-only for Ana: she can see it (as
  // temporary access, before the reassignment below) but not reply through
  // it — that would mean answering Marta from a number that isn't Ana's.
  await anaPage.goto(`/inbox/${luisConversationId}`);
  await expect(anaPage.getByText("Solo lectura")).toBeVisible();
  await expect(anaPage.getByPlaceholder("Escribe una respuesta...")).toHaveCount(0);

  // The ADMIN reassigns Marta to Ana from the Contact page.
  await adminPage.goto(`/contacts/${contactId}`);
  await adminPage.getByLabel(`Delegado de referencia de ${martaName}`).selectOption({ label: anaName });
  const reassignDialog = adminPage.getByRole("dialog");
  await expect(reassignDialog.getByText(`¿Hacer a ${anaName} el delegado de referencia`)).toBeVisible();
  await reassignDialog.getByRole("button", { name: "Reasignar" }).click();
  await expect(adminPage.getByRole("dialog")).toHaveCount(0);
  await expect(adminPage.getByLabel(`Delegado de referencia de ${martaName}`)).toHaveValue(
    await sql`select id from users where name = ${anaName}`.then((rows) => rows[0].id as string),
  );
  const history = await sql`
    select delegate_id, ended_at from contact_assignments where contact_id = ${contactId} order by started_at desc
  `;
  expect(history).toHaveLength(2);
  expect(history[0].ended_at).toBeNull();

  // Ana is no longer highlighted anywhere in her own list — she is the
  // reference now, not a borrowed contact.
  await anaPage.goto("/inbox");
  await expect(anaConversationList.getByText(martaName).first()).toBeVisible();
  await expect(anaConversationList.getByText(/^Ref\.:/)).toHaveCount(0);

  await adminContext.close();
  await luisContext.close();
  await anaContext.close();
});
