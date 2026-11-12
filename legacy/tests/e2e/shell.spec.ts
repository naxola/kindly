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

  const inboxLink = page.getByRole("link", { name: "Conversaciones", exact: true });
  await expect(inboxLink).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "Contactos" }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByRole("link", { name: "Contactos", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(inboxLink).not.toHaveAttribute("aria-current", "page");
});

test("collapsing the sidebar is remembered across a reload", async ({ page }) => {
  await register(page, `Collapse ${randomUUID().slice(0, 8)}`);

  const expandedNav = page.getByRole("navigation", { name: "Principal" });
  await expect(expandedNav.getByText("Conversaciones", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Contraer menú" }).click();
  // The label switches to "Expandir menú" and item labels hide (icon-only,
  // with the name only in the accessible tree via aria-label).
  const collapseToggle = page.getByRole("button", { name: "Expandir menú" });
  await expect(collapseToggle).toBeVisible();
  await expect(expandedNav.getByText("Conversaciones", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Conversaciones", exact: true })).toBeVisible();

  // Persisted server-side (cookie), not just client state: a hard reload
  // must render collapsed from the very first paint, no flash.
  await page.reload();
  await expect(page.getByRole("button", { name: "Expandir menú" })).toBeVisible();
  await expect(expandedNav.getByText("Conversaciones", { exact: true })).toHaveCount(0);

  await collapseToggle.click();
  await expect(page.getByRole("button", { name: "Contraer menú" })).toBeVisible();
});

test("picking a theme from the user menu applies it instantly and the server paints it on the next load, no flash", async ({
  page,
}) => {
  const name = `Theme ${randomUUID().slice(0, 8)}`;
  await register(page, name);

  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Oscuro" }).click();

  // Applied to <html> immediately — no reload, no router.refresh().
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // The preference is a cookie, not just client state: the *server-rendered*
  // markup for another route already carries the attribute, proving there
  // is no light-then-dark flash on the next navigation.
  const response = await page.request.get("/organization");
  const html = await response.text();
  expect(html).toContain('data-theme="dark"');

  // Survives a hard reload too.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Oscuro" })).toHaveAttribute("aria-checked", "true");

  // Back to "Sistema": the attribute is removed, not set to some third value.
  await page.getByRole("menuitemradio", { name: "Sistema" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});

test("below md, the sidebar is a Sheet opened from the header and closes itself on navigation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await register(page, `Mobile ${randomUUID().slice(0, 8)}`);

  await expect(page.getByRole("navigation", { name: "Principal" })).toBeHidden();

  await page.getByRole("button", { name: "Abrir menú" }).click();
  const mobileNav = page.getByRole("navigation", { name: "Principal" });
  await expect(mobileNav).toBeVisible();

  await mobileNav.getByRole("link", { name: "Contactos" }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(mobileNav).toBeHidden();
});
