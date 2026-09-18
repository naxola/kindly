import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Single happy-path E2E required by PKG-001 (project/CURRENT_TASK.md):
 * register → login → protected route → logout. Everything else (real
 * product UI) is out of scope until a future package.
 */
test("register, reach the protected dashboard, and sign out", async ({ page }) => {
  const email = `${randomUUID()}@example.com`;
  const password = "correcthorsebattery";

  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();

  await page.getByPlaceholder("Nombre").fill("Playwright User");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The dashboard must not be reachable anymore without a session.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
