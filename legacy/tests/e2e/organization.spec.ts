import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * UI-7: the "Organización" sidebar item and header breadcrumb menu, the
 * General page (rename, ADMIN-only), and changing a member's role
 * (ORGANIZATION.md §4, approved 2026-09-26) including the guard that never
 * leaves the organization without an ADMIN.
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

test("the sidebar and header both reach Organización, and an ADMIN can rename it", async ({ page }) => {
  const adminName = `Org Admin ${randomUUID().slice(0, 8)}`;
  await register(page, adminName);

  await page.getByRole("link", { name: "Organización", exact: true }).click();
  await expect(page).toHaveURL(/\/organization$/);
  await expect(page.getByRole("heading", { name: `${adminName}'s organization` })).toBeVisible();

  const newName = `Renamed Org ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nombre de la organización").fill(newName);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: newName })).toBeVisible();

  // The header breadcrumb menu reflects the new name and can reach the
  // other two organization pages. Scoped to `menuitem` (Radix's role for a
  // `DropdownMenuItem`, even one rendered `asChild` as a plain `<a>`): the
  // page's own `ProductMenu` and "Resumen" summary already have their own
  // "Canales" links, so an unscoped `role: "link"` lookup is ambiguous.
  await page.getByRole("button", { name: newName }).click();
  await page.getByRole("menuitem", { name: "Canales" }).click();
  await expect(page).toHaveURL(/\/organization\/channels$/);
});

test("an ADMIN changes a DELEGATE's role, and a DELEGATE cannot", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await register(adminPage, `Role Admin ${randomUUID().slice(0, 8)}`);

  const inviteeEmail = `${randomUUID()}@example.com`;
  await adminPage.goto("/organization/members");
  await adminPage.getByRole("button", { name: "Invitar" }).click();
  const inviteDialog = adminPage.getByRole("dialog");
  await inviteDialog.getByLabel("Email").fill(inviteeEmail);
  await inviteDialog.getByLabel("Rol").selectOption("DELEGATE");
  await inviteDialog.getByRole("button", { name: "Invitar" }).click();
  await expect(adminPage.getByText(inviteeEmail)).toBeVisible();

  const [invitation] = await sql`
    select token from organization_invitations where email = ${inviteeEmail} limit 1
  `;

  const delegateContext = await browser.newContext();
  const delegatePage = await delegateContext.newPage();
  const delegateName = `Promoted Delegate ${randomUUID().slice(0, 8)}`;
  await delegatePage.goto(`/invite/${invitation.token}`);
  await delegatePage.getByPlaceholder("Nombre").fill(delegateName);
  await delegatePage.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await delegatePage.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(delegatePage).toHaveURL(/\/inbox$/);

  // A DELEGATE sees the role as plain text, not an editable control.
  await delegatePage.goto("/organization/members");
  await expect(delegatePage.getByLabel(`Rol de ${delegateName}`)).toHaveCount(0);

  // The ADMIN promotes them to ADMIN.
  await adminPage.goto("/organization/members");
  const roleSelect = adminPage.getByLabel(`Rol de ${delegateName}`);
  await roleSelect.selectOption("ADMIN");
  const confirmDialog = adminPage.getByRole("dialog");
  await expect(confirmDialog.getByText("a ADMIN?")).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Cambiar rol" }).click();
  await expect(roleSelect).toHaveValue("ADMIN");

  await adminContext.close();
  await delegateContext.close();
});

test("the sole ADMIN cannot demote themselves", async ({ page }) => {
  const adminName = `Sole Admin ${randomUUID().slice(0, 8)}`;
  await register(page, adminName);

  await page.goto("/organization/members");
  const roleSelect = page.getByLabel(`Rol de ${adminName}`);
  await roleSelect.selectOption("DELEGATE");
  const confirmDialog = page.getByRole("dialog");
  await confirmDialog.getByRole("button", { name: "Cambiar rol" }).click();

  // The dialog stays open with the error (ConfirmDialog's contract), so the
  // select still shows the rejected target role until it is dismissed.
  await expect(confirmDialog.getByText("al menos un ADMIN")).toBeVisible();
  await expect(roleSelect).toHaveValue("DELEGATE");

  await confirmDialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(roleSelect).toHaveValue("ADMIN");
});
