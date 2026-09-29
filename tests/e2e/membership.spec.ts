import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * UI-10b happy path (`docs/ui/CONVERSATION_WORKSPACE.md` §5.1): alta,
 * edición, baja and "volver a afiliarse" from `/contacts/[id]`, and the
 * derived "cuota pendiente" warning. The ficha inside the conversation
 * panel only *reads* this same data (`MembershipStatus`, no form of its
 * own) — covered by rendering the same component, not a separate flow.
 */
test("give a Contact a Membership, watch the fee warning, then baja and rejoin", async ({ page }) => {
  const email = `${randomUUID()}@example.com`;
  const password = "correcthorsebattery";
  const contactName = `Afiliado ${randomUUID().slice(0, 8)}`;

  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill("Membership E2E User");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);

  await page.getByRole("link", { name: "Contactos" }).click();
  await page.getByRole("button", { name: "Nuevo contacto" }).click();
  await page.getByLabel("Nombre").fill(contactName);
  await page.getByRole("button", { name: "Crear contacto" }).click();
  await page.getByRole("link", { name: contactName }).click();

  // Before any alta.
  await expect(page.getByText("Sin dar de alta.")).toBeVisible();

  // Alta, with the fee paid through a month before the current one — the
  // pending-fee warning is a fixed rule, not something the AI infers.
  await page.getByLabel("Número de afiliado").fill("48213");
  await page.getByLabel("Cuota pagada hasta").fill("2020-01");
  await page.getByRole("button", { name: "Dar de alta" }).click();

  await expect(page.getByText("Afiliación activa")).toBeVisible();
  await expect(page.getByText(/pendiente\.$/)).toBeVisible();

  // Dar de baja.
  await page.getByRole("button", { name: "Dar de baja" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Dar de baja" }).click();
  await expect(page.getByText("Afiliación dada de baja")).toBeVisible();
  await expect(page.getByText("Buen momento para proponer que vuelva a afiliarse.")).toBeVisible();

  // Volver a afiliarse: same form, different submit label, same member number kept.
  await expect(page.getByRole("button", { name: "Volver a afiliar" })).toBeVisible();
  await expect(page.getByLabel("Número de afiliado")).toHaveValue("48213");
  await page.getByRole("button", { name: "Volver a afiliar" }).click();
  await expect(page.getByText("Afiliación activa")).toBeVisible();
});
