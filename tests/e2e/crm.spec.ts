import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * PKG-002 happy path (project/CURRENT_TASK.md): register → create a
 * Contact → create a Case for that Contact → create a Task → mark it
 * completed. Exercises the Server Actions through a real browser, since
 * they use React's form-action protocol (not something curl can fake).
 */
test("register, create a Contact, a Case for it, and a Task, then complete it", async ({ page }) => {
  const email = `${randomUUID()}@example.com`;
  const password = "correcthorsebattery";
  const contactName = `Contact ${randomUUID().slice(0, 8)}`;
  const caseTitle = `Case ${randomUUID().slice(0, 8)}`;
  const taskTitle = `Task ${randomUUID().slice(0, 8)}`;

  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill("CRM E2E User");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);

  // Create a Contact.
  await page.getByRole("link", { name: "Contacts" }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await page.getByPlaceholder("Nombre").fill(contactName);
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByRole("link", { name: contactName })).toBeVisible();

  // Create a Case for that Contact.
  await page.getByRole("link", { name: "Cases" }).click();
  await expect(page).toHaveURL(/\/cases$/);
  await page.getByLabel("Contact").selectOption({ label: contactName });
  await page.getByPlaceholder("Título").fill(caseTitle);
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByRole("link", { name: caseTitle })).toBeVisible();

  // Open the Case and confirm the activity feed logged its creation.
  await page.getByRole("link", { name: caseTitle }).click();
  await expect(page.getByText("Case creado")).toBeVisible();

  // Create a Task.
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.getByPlaceholder("Título").fill(taskTitle);
  await page.getByRole("button", { name: "Crear" }).click();
  const taskRow = page.getByRole("listitem").filter({ hasText: taskTitle });
  await expect(taskRow).toBeVisible();

  // Mark it completed from the list (one-click toggle) and verify the
  // strike-through styling flips.
  await taskRow.getByRole("button", { name: "Marcar como completada" }).click();
  await expect(page.getByRole("link", { name: taskTitle })).toHaveClass(/line-through/);
});

test("a second organization cannot see the first organization's contacts", async ({ browser }) => {
  const contactName = `Isolated ${randomUUID().slice(0, 8)}`;

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto("/login");
  await pageA.getByText("¿No tienes cuenta? Regístrate").click();
  await pageA.getByPlaceholder("Nombre").fill("Org A User");
  await pageA.getByPlaceholder("Email").fill(`${randomUUID()}@example.com`);
  await pageA.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await pageA.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(pageA).toHaveURL(/\/inbox$/);
  await pageA.getByRole("link", { name: "Contacts" }).click();
  await pageA.getByPlaceholder("Nombre").fill(contactName);
  await pageA.getByRole("button", { name: "Crear" }).click();
  await expect(pageA.getByRole("link", { name: contactName })).toBeVisible();
  await contextA.close();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto("/login");
  await pageB.getByText("¿No tienes cuenta? Regístrate").click();
  await pageB.getByPlaceholder("Nombre").fill("Org B User");
  await pageB.getByPlaceholder("Email").fill(`${randomUUID()}@example.com`);
  await pageB.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await pageB.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(pageB).toHaveURL(/\/inbox$/);
  await pageB.getByRole("link", { name: "Contacts" }).click();
  await expect(pageB.getByText("Todavía no hay contacts.")).toBeVisible();
  await expect(pageB.getByRole("link", { name: contactName })).toHaveCount(0);
  await contextB.close();
});
