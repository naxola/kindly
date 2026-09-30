import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expectNoSeriousAccessibilityViolations } from "./axe-helpers";

/**
 * Fase 7d — Trámites: an ADMIN creates a procedure and publishes a new
 * version (the old one is kept as "Sustituida"); a DELEGATE can read it
 * but is offered no way to edit it.
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

test("an ADMIN creates a procedure and publishes a new version; a DELEGATE can only read", async ({
  page,
  browser,
}) => {
  const name = `Baja por IT ${randomUUID().slice(0, 8)}`;
  await register(page, `Admin ${randomUUID().slice(0, 8)}`);

  await page.goto("/knowledge/procedures");
  await expect(page.getByText("Todavía no hay trámites")).toBeVisible();
  await page.getByRole("button", { name: "Nuevo trámite" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Nombre").fill(name);
  await sheet.getByLabel("Pasos").fill("Recibir el parte\nPresentarlo en la mutua");
  await sheet.getByLabel("Documentos requeridos").fill("Parte de baja\nDNI");
  await sheet.getByRole("button", { name: "Crear trámite" }).click();

  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Parte de baja" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, "/knowledge/procedures/[id]");

  await page.getByLabel("Documentos requeridos").fill("Parte de baja\nDNI\nNómina");
  await page.getByRole("button", { name: "Publicar versión" }).click();
  await expect(page.getByText("Versión 2")).toBeVisible();
  await expect(page.getByText("Sustituida")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Nómina" })).toBeVisible();

  // A DELEGATE in the same organization sees it, without edit controls.
  const email = `${randomUUID()}@example.com`;
  await page.goto("/organization/members");
  await page.getByRole("button", { name: "Invitar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Rol").selectOption("DELEGATE");
  await dialog.getByRole("button", { name: "Invitar" }).click();
  await expect(page.getByText(email)).toBeVisible();
  const [invitation] = await sql`select token from organization_invitations where email = ${email} limit 1`;

  const context = await browser.newContext();
  const delegate = await context.newPage();
  await delegate.goto(`/invite/${invitation.token}`);
  await delegate.getByPlaceholder("Nombre").fill(`Delegate ${randomUUID().slice(0, 8)}`);
  await delegate.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await delegate.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(delegate).toHaveURL(/\/inbox$/);

  await delegate.goto("/knowledge/procedures");
  await expect(delegate.getByRole("link", { name })).toBeVisible();
  await expect(delegate.getByRole("button", { name: "Nuevo trámite" })).toHaveCount(0);
  await delegate.getByRole("link", { name }).click();
  await expect(delegate.getByRole("listitem").filter({ hasText: "Nómina" })).toBeVisible();
  await expect(delegate.getByRole("button", { name: "Publicar versión" })).toHaveCount(0);
  await context.close();
});
