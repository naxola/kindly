import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * PKG-006 happy path: an ADMIN invites someone, that person accepts the
 * invitation by registering, and lands inside the *inviting* organization
 * as a DELEGATE — not as ADMIN of a brand-new empty one, which is what
 * happened before this package existed.
 *
 * The invitation link is read from the database rather than scraped off
 * the page: its token is generated server-side, and the page shows it as
 * plain text for the ADMIN to copy (Kindly does not send email yet).
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

test("an ADMIN invites a DELEGATE, who accepts and joins the same organization", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const adminName = `Admin ${randomUUID().slice(0, 8)}`;
  await register(adminPage, adminName, `${randomUUID()}@example.com`);

  const inviteeEmail = `${randomUUID()}@example.com`;
  await adminPage.getByRole("link", { name: "Miembros" }).click();
  await expect(adminPage).toHaveURL(/\/members$/);
  await adminPage.getByLabel("Email").fill(inviteeEmail);
  await adminPage.getByLabel("Rol").selectOption("DELEGATE");
  await adminPage.getByRole("button", { name: "Invitar" }).click();
  await expect(adminPage.getByText(inviteeEmail)).toBeVisible();

  const [invitation] = await sql`
    select token from organization_invitations where email = ${inviteeEmail} limit 1
  `;
  expect(invitation).toBeTruthy();

  // The invitee opens the link in a browser with no session at all.
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  const inviteeName = `Delegate ${randomUUID().slice(0, 8)}`;
  await inviteePage.goto(`/invite/${invitation.token}`);
  await expect(inviteePage.getByText("Te han invitado a")).toBeVisible();
  await inviteePage.getByPlaceholder("Nombre").fill(inviteeName);
  await inviteePage.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await inviteePage.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(inviteePage).toHaveURL(/\/inbox$/);

  // They are inside the ADMIN's organization, seeing the ADMIN as a peer.
  // Scoped to the members table: the org is named after the ADMIN, so their
  // name also appears in the layout header.
  await inviteePage.getByRole("link", { name: "Miembros" }).click();
  const membersTable = inviteePage.getByRole("table");
  await expect(membersTable.getByText(adminName)).toBeVisible();
  await expect(membersTable.getByText(inviteeName)).toBeVisible();
  // ...and, being a DELEGATE, cannot invite anyone.
  await expect(inviteePage.getByRole("button", { name: "Invitar" })).toHaveCount(0);

  // Back on the ADMIN's side the invitation is gone from "pending".
  await adminPage.reload();
  await expect(adminPage.getByText("No hay invitaciones pendientes.")).toBeVisible();
  await expect(adminPage.getByRole("table").getByText(inviteeName)).toBeVisible();

  await adminContext.close();
  await inviteeContext.close();
});

test("a revoked invitation explains itself instead of registering anyone", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await register(adminPage, `Admin ${randomUUID().slice(0, 8)}`, `${randomUUID()}@example.com`);

  const inviteeEmail = `${randomUUID()}@example.com`;
  await adminPage.getByRole("link", { name: "Miembros" }).click();
  await adminPage.getByLabel("Email").fill(inviteeEmail);
  await adminPage.getByRole("button", { name: "Invitar" }).click();
  await expect(adminPage.getByText(inviteeEmail)).toBeVisible();

  const [invitation] = await sql`
    select token from organization_invitations where email = ${inviteeEmail} limit 1
  `;

  await adminPage.getByRole("button", { name: "Revocar" }).click();
  await expect(adminPage.getByText("No hay invitaciones pendientes.")).toBeVisible();

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(`/invite/${invitation.token}`);
  await expect(inviteePage.getByText("Esta invitación se ha revocado")).toBeVisible();
  await expect(inviteePage.getByRole("button", { name: "Aceptar invitación" })).toHaveCount(0);

  await adminContext.close();
  await inviteeContext.close();
});
