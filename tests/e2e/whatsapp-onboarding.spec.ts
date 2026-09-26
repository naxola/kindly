import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * PKG-008: the onboarding a channel demands before it can be connected.
 * Exercised against `fake-coex`, the stub that declares
 * `onboarding: "WHATSAPP_COEXISTENCE"` — the flow itself knows nothing
 * about WhatsApp beyond that declaration.
 */

async function registerAndReachChannels(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(`Onboarding ${randomUUID().slice(0, 8)}`);
  await page.getByPlaceholder("Email").fill(`${randomUUID()}@example.com`);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await page.getByRole("link", { name: "Canales", exact: true }).click();
  await expect(page).toHaveURL(/\/channels$/);
}

test("the two undecided paths are shown as unavailable, with a reason", async ({ page }) => {
  await registerAndReachChannels(page);
  await page.getByRole("link", { name: "Conectar fake-coex", exact: true }).click();

  await expect(page.getByText("Conectar mi número actual de WhatsApp Business")).toBeVisible();
  await expect(page.getByText("Crear una cuenta de WhatsApp Business nueva")).toBeVisible();
  await expect(page.getByText("Migrar desde otro proveedor (BSP)")).toBeVisible();

  // Only the decided path can be followed; the other two say why not.
  await expect(page.getByRole("link", { name: "Siguiente" })).toHaveCount(1);
  await expect(page.getByText("No disponible todavía.")).toHaveCount(2);
});

test("the connection cannot start until every consequence is acknowledged", async ({ page }) => {
  await registerAndReachChannels(page);
  await page.getByRole("link", { name: "Conectar fake-coex", exact: true }).click();
  await page.getByRole("link", { name: "Siguiente" }).click();

  // The things a delegate loses on their own phone are spelled out.
  await expect(page.getByText("Perderás algunas funciones en el móvil")).toBeVisible();
  await expect(page.getByText("Se sincronizarán hasta 180 días de historial")).toBeVisible();

  const submit = page.getByRole("button", { name: "Continuar con Facebook" });
  await expect(submit).toBeDisabled();

  const checks = page.locator('input[name="acknowledged"]');
  const total = await checks.count();
  expect(total).toBeGreaterThan(1);

  // One short of all of them is still not enough.
  for (let index = 0; index < total - 1; index++) {
    await checks.nth(index).check();
  }
  await expect(submit).toBeDisabled();

  await checks.nth(total - 1).check();
  await expect(submit).toBeEnabled();

  await submit.click();
  await expect(page).toHaveURL(/\/channels$/);
  await expect(page.getByText("Los mensajes se sincronizan con normalidad.")).toBeVisible();
});

test("the server rejects a half-acknowledged preflight even if the button is forced", async ({ page }) => {
  await registerAndReachChannels(page);
  await page.getByRole("link", { name: "Conectar fake-coex", exact: true }).click();
  await page.getByRole("link", { name: "Siguiente" }).click();

  const checks = page.locator('input[name="acknowledged"]');
  await expect(checks.first()).toBeVisible();
  await checks.first().check();

  // The disabled button is a courtesy to the reader, not a guarantee about
  // what reaches the server — so bypass it and check the server's own
  // re-validation, which is the part that actually protects the delegate.
  await page
    .getByRole("button", { name: "Continuar con Facebook" })
    .evaluate((button) => button.removeAttribute("disabled"));
  await page.getByRole("button", { name: "Continuar con Facebook" }).click();

  await expect(page.getByText("No se pudo conectar el canal")).toBeVisible();
  await expect(page.getByText("Faltan puntos por confirmar antes de conectar.")).toBeVisible();
  await expect(page).toHaveURL(/\/coexistence/);
});
