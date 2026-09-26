import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * PKG-007: channel settings are per delegate. A DELEGATE sees and manages
 * only their own communication identity; an ADMIN additionally sees the
 * organization's other connections. Nobody connects a channel for someone
 * else — every real provider authenticates the account holder in person.
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

test("a DELEGATE sees only their own channel, the ADMIN sees the whole organization", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const adminName = `Admin ${randomUUID().slice(0, 8)}`;
  await register(adminPage, adminName, `${randomUUID()}@example.com`);

  // Invite a delegate and let them in.
  const inviteeEmail = `${randomUUID()}@example.com`;
  await adminPage.getByRole("link", { name: "Miembros" }).click();
  await adminPage.getByLabel("Email").fill(inviteeEmail);
  await adminPage.getByLabel("Rol").selectOption("DELEGATE");
  await adminPage.getByRole("button", { name: "Invitar" }).click();
  await expect(adminPage.getByText(inviteeEmail)).toBeVisible();

  const [invitation] = await sql`
    select token from organization_invitations where email = ${inviteeEmail} limit 1
  `;

  const delegateContext = await browser.newContext();
  const delegatePage = await delegateContext.newPage();
  const delegateName = `Delegate ${randomUUID().slice(0, 8)}`;
  await delegatePage.goto(`/invite/${invitation.token}`);
  await delegatePage.getByPlaceholder("Nombre").fill(delegateName);
  await delegatePage.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await delegatePage.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(delegatePage).toHaveURL(/\/inbox$/);

  // The delegate connects their own channel.
  await delegatePage.getByRole("link", { name: "Canales", exact: true }).click();
  await expect(delegatePage.getByText("Todavía no has conectado ningún canal.")).toBeVisible();
  await delegatePage.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(delegatePage.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();

  // A DELEGATE never sees anyone else's channels — not even read-only.
  // Asserted on the list itself rather than on the ADMIN's name, which also
  // appears in the layout header (the organization is named after them).
  await expect(delegatePage.getByRole("list", { name: "Canales del resto de la organización" })).toHaveCount(0);
  await expect(delegatePage.getByRole("list", { name: "Canales conectados a tu nombre" })).toBeVisible();

  // The ADMIN connects their own too, and sees both.
  await adminPage.getByRole("link", { name: "Canales", exact: true }).click();
  await adminPage.getByRole("button", { name: "Conectar fake", exact: true }).click();
  await expect(adminPage.getByText("Los mensajes se sincronizan con normalidad.").first()).toBeVisible();
  const othersList = adminPage.getByRole("list", { name: "Canales del resto de la organización" });
  await expect(othersList).toBeVisible();
  await expect(othersList.getByText(delegateName)).toBeVisible();

  await adminContext.close();
  await delegateContext.close();
});
