import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Single happy-path E2E required by PKG-001 (project/CURRENT_TASK.md):
 * register → login → protected route → logout. Everything else (real
 * product UI) is out of scope until a future package.
 *
 * Since UI-2 (docs/ui/LAYOUT_NAVIGATION.md §7), the destination after
 * signup/login is `/inbox`, not `/dashboard` — `/dashboard` is now only a
 * redirect kept for old links. The email is checked inside the header's
 * user menu, which is where account info lives now (docs/ui/LAYOUT_NAVIGATION.md
 * §2), and signing out is a "Cerrar sesión" item there rather than a
 * standalone button.
 */
test("register, reach the protected app, and sign out", async ({ page }) => {
  const email = `${randomUUID()}@example.com`;
  const password = "correcthorsebattery";

  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();

  await page.getByPlaceholder("Nombre").fill("Playwright User");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page).toHaveURL(/\/inbox$/);

  await page.getByRole("button", { name: "Playwright User" }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Neither the app nor the old dashboard redirect is reachable without a
  // session.
  await page.goto("/inbox");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
