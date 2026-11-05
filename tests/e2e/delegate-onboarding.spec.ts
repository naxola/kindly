import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Delegate onboarding happy path: a member saves their professional phone,
 * and an affiliate is created with a chosen delegate and the welcome-email
 * option. The E2E server has no email provider (production build without
 * RESEND_API_KEY), so the send fails *by design* — which is exactly the
 * graceful path: the affiliate is still created and the user is told the
 * email did not go out. The success path of the send is covered by
 * tests/integration/delegate-welcome.test.ts with a fake EmailSender.
 */

async function register(page: Page, name: string, email: string) {
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
}

test("a member saves their phone and an affiliate is created with delegate + welcome option", async ({ page }) => {
  const adminName = `Admin ${randomUUID().slice(0, 8)}`;
  await register(page, adminName, `${randomUUID()}@example.com`);

  // Phone: invalid is rejected, valid is saved.
  await page.goto("/organization/members");
  const phone = page.getByLabel(`Teléfono de ${adminName}`);
  await phone.fill("600111222");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Teléfono no válido")).toBeVisible();
  await phone.fill("+34 600 111 222");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Teléfono actualizado")).toBeVisible();

  // Affiliate: the welcome checkbox needs an email; the delegate picker is there for an ADMIN.
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Nuevo contacto" }).click();
  const sheet = page.getByRole("dialog");
  const welcome = sheet.getByLabel("Enviar email de bienvenida");
  await expect(welcome).toBeDisabled();
  await expect(sheet.getByLabel("Delegado de referencia")).toBeVisible();

  const contactName = `Afiliada ${randomUUID().slice(0, 8)}`;
  await sheet.getByLabel("Nombre").fill(contactName);
  await sheet.getByRole("textbox", { name: /^Email/ }).fill(`${randomUUID()}@example.com`);
  await expect(welcome).toBeEnabled();
  await welcome.check();
  await sheet.getByRole("button", { name: "Crear contacto" }).click();

  // No email provider in E2E: created anyway, and the user is told the email failed.
  await expect(page.getByText(/Afiliado creado\. No se pudo enviar el email de bienvenida/)).toBeVisible();
  await page.getByRole("link", { name: contactName }).click();
  await expect(page.getByText("Aún no enviado a")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar bienvenida" })).toBeVisible();
});
