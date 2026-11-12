import { expect, test } from "@playwright/test";

/**
 * The public site exists to be read by two audiences that share one
 * requirement: no account.
 *
 * Meta fetches the privacy policy URL periodically and flags the app if it
 * errors or asks for a login — three consecutive failures can get the app
 * removed. So "reachable with no session, no redirect" is not a nicety
 * here, it is the thing under test.
 */

const publicPages = [
  { path: "/", heading: "Sigues respondiendo desde tu móvil" },
  { path: "/privacidad", heading: "Política de privacidad" },
  { path: "/terminos", heading: "Términos del servicio" },
  { path: "/aviso-legal", heading: "Aviso legal" },
  { path: "/eliminacion-de-datos", heading: "Eliminar mis datos" },
];

for (const page of publicPages) {
  test(`${page.path} se lee sin iniciar sesión`, async ({ browser }) => {
    // A brand-new context: no cookies, nothing stored, like a reviewer's bot.
    const context = await browser.newContext();
    const tab = await context.newPage();

    const response = await tab.goto(page.path);
    expect(response?.status()).toBe(200);
    // Never bounced to the login wall.
    expect(new URL(tab.url()).pathname).toBe(page.path);
    await expect(tab.getByRole("heading", { name: new RegExp(page.heading, "i") }).first()).toBeVisible();

    await context.close();
  });
}

test("la política de privacidad identifica el producto y la empresa, y enlaza el borrado", async ({ browser }) => {
  const context = await browser.newContext();
  const tab = await context.newPage();
  await tab.goto("/privacidad");

  // Meta requires both the app name and the organization to appear.
  await expect(tab.getByText("Kindly").first()).toBeVisible();
  await expect(tab.getByText(/Responsable:/)).toBeVisible();
  // In the body of the document, not the one in the footer.
  await expect(
    tab.getByRole("main").getByRole("link", { name: "eliminar mis datos", exact: true }),
  ).toBeVisible();

  await context.close();
});

test("el pie enlaza los cuatro documentos legales desde cualquier página pública", async ({ browser }) => {
  const context = await browser.newContext();
  const tab = await context.newPage();
  await tab.goto("/");

  const footer = tab.getByRole("contentinfo");
  for (const name of ["Privacidad", "Términos", "Aviso legal", "Eliminar mis datos"]) {
    await expect(footer.getByRole("link", { name })).toBeVisible();
  }

  await context.close();
});
