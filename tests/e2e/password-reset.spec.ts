import { expect, test } from "@playwright/test";

/**
 * PKG-012, browser side. The token round trip (email → link → new password
 * → sign-in) is covered against real PostgreSQL in
 * tests/integration/auth-flow.test.ts; the E2E server has no email
 * provider, so here only what the user sees is checked.
 */

test("desde el login se pide un enlace y la confirmación no revela si la cuenta existe", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "¿Has olvidado tu contraseña?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  await page.getByPlaceholder("Email de tu cuenta").fill(`nadie-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText(/te acabamos de enviar un enlace/)).toBeVisible();
});

test("un enlace caducado o manipulado explica qué pasa y ofrece pedir otro", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText(/Este enlace ya no sirve/)).toBeVisible();
  await page.getByRole("link", { name: "Pedir otro enlace" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("un token que no existe se rechaza al enviar la contraseña nueva", async ({ page }) => {
  await page.goto("/reset-password?token=not-a-real-token");
  await page.getByPlaceholder("Contraseña nueva").fill("una-clave-nueva");
  await page.getByPlaceholder("Repite la contraseña").fill("una-clave-nueva");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(page.getByText(/Este enlace ya no sirve/)).toBeVisible();
});
