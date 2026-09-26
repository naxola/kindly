import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * UI-2 happy path (docs/ui/ROADMAP.md, Fase 2 — Shell de aplicación):
 * skip link, active nav state, sidebar collapse persisted across a reload,
 * and the mobile Sheet standing in for the sidebar below `md`.
 */
async function register(page: import("@playwright/test").Page, name: string) {
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByPlaceholder("Email").fill(`${randomUUID()}@example.com`);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
}

test("skip link jumps past the shell straight to the content", async ({ page }) => {
  await register(page, `Skip ${randomUUID().slice(0, 8)}`);

  // First Tab from a fresh load reaches the skip link before anything else.
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("the active nav item is marked current and survives navigating between modules", async ({ page }) => {
  await register(page, `Nav ${randomUUID().slice(0, 8)}`);

  const inboxLink = page.getByRole("link", { name: "Inbox", exact: true });
  await expect(inboxLink).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "Contacts" }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByRole("link", { name: "Contacts", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(inboxLink).not.toHaveAttribute("aria-current", "page");
});

test("collapsing the sidebar is remembered across a reload", async ({ page }) => {
  await register(page, `Collapse ${randomUUID().slice(0, 8)}`);

  const expandedNav = page.getByRole("navigation", { name: "Principal" });
  await expect(expandedNav.getByText("Inbox", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Contraer menú" }).click();
  // The label switches to "Expandir menú" and item labels hide (icon-only,
  // with the name only in the accessible tree via aria-label).
  const collapseToggle = page.getByRole("button", { name: "Expandir menú" });
  await expect(collapseToggle).toBeVisible();
  await expect(expandedNav.getByText("Inbox", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Inbox", exact: true })).toBeVisible();

  // Persisted server-side (cookie), not just client state: a hard reload
  // must render collapsed from the very first paint, no flash.
  await page.reload();
  await expect(page.getByRole("button", { name: "Expandir menú" })).toBeVisible();
  await expect(expandedNav.getByText("Inbox", { exact: true })).toHaveCount(0);

  await collapseToggle.click();
  await expect(page.getByRole("button", { name: "Contraer menú" })).toBeVisible();
});

test("below md, the sidebar is a Sheet opened from the header and closes itself on navigation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await register(page, `Mobile ${randomUUID().slice(0, 8)}`);

  await expect(page.getByRole("navigation", { name: "Principal" })).toBeHidden();

  await page.getByRole("button", { name: "Abrir menú" }).click();
  const mobileNav = page.getByRole("navigation", { name: "Principal" });
  await expect(mobileNav).toBeVisible();

  await mobileNav.getByRole("link", { name: "Contacts" }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(mobileNav).toBeHidden();
});
