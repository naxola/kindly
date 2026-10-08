import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expectNoSeriousAccessibilityViolations } from "./axe-helpers";

/**
 * Fases 7e/7f — Knowledge UI: document list (GLOBAL + own organization,
 * never another's) and detail, SQL-seeded (zero-vector embedding); plus the
 * ADMIN upload flow (text, PDF, new version, validation and SSRF refusals,
 * searchable result with citation), run with the deterministic fake
 * `EmbeddingProvider` (`E2E_FAKE_EMBEDDINGS`, see `playwright.config.ts`).
 */

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

test.afterAll(async () => {
  await sql.end();
});

async function register(page: import("@playwright/test").Page, name: string) {
  await page.goto("/login");
  await page.getByText("¿No tienes cuenta? Regístrate").click();
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByPlaceholder("Email").fill(`${randomUUID()}@example.com`);
  await page.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
}

async function seedDocument(organizationId: string | null, title: string) {
  const visibility = organizationId ? "ORGANIZATION" : "GLOBAL";
  const [doc] = await sql`
    insert into knowledge_documents (organization_id, visibility, title, source_type, jurisdiction)
    values (${organizationId}, ${visibility}, ${title}, 'MANUAL', 'ES') returning id`;
  const [version] = await sql`
    insert into knowledge_document_versions (document_id, version, status, effective_from, source)
    values (${doc.id}, '2024', 'CURRENT', '2024-01-10', 'BOE núm. 5') returning id`;
  await sql`
    insert into knowledge_chunks (document_version_id, document_id, organization_id, visibility, ordinal, level, label, content, search_text, embedding, embedding_model)
    values (${version.id}, ${doc.id}, ${organizationId}, ${visibility}, 1, 'ARTICLE', '12', ${`Texto del artículo de ${title}`},
            ${`Documento: ${title}\n\nTexto del artículo de ${title}`}, array_fill(0, array[1536])::vector, 'legacy')`;
  return doc.id as string;
}

test("lists own + global documents, hides another organization's, and shows versions and chunks", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  await register(page, `Know ${suffix}`);

  const [org] = await sql`
    select o.id from organizations o
    join organization_members m on m.organization_id = o.id
    join users u on u.id = m.user_id
    where u.name = ${`Know ${suffix}`} limit 1`;

  const ownTitle = `Protocolo propio ${suffix}`;
  const globalTitle = `Ley pública ${suffix}`;
  const otherTitle = `Secreto ajeno ${suffix}`;

  const [other] = await sql`insert into organizations (name) values (${`Otra org ${suffix}`}) returning id`;
  const ownId = await seedDocument(org.id, ownTitle);
  await seedDocument(null, globalTitle);
  await seedDocument(other.id, otherTitle);

  await page.getByRole("link", { name: "Conocimiento" }).click();
  await expect(page).toHaveURL(/\/knowledge$/);
  await expect(page.getByRole("link", { name: ownTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: globalTitle })).toBeVisible();
  await expect(page.getByText(otherTitle)).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page, "/knowledge");

  await page.getByRole("link", { name: ownTitle }).click();
  await expect(page).toHaveURL(new RegExp(`/knowledge/${ownId}$`));
  await expect(page.getByRole("heading", { name: ownTitle, level: 1 })).toBeVisible();
  await expect(page.getByText("Versión 2024")).toBeVisible();
  await expect(page.locator("span").filter({ hasText: /^Vigente$/ })).toBeVisible();
  await expect(page.getByText("Desde 10/01/2024 · BOE núm. 5")).toBeVisible();
  await expect(page.getByText(`Texto del artículo de ${ownTitle}`)).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, "/knowledge/[id]");

});

test("another organization's private document is a 404", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  await register(page, `Know404 ${suffix}`);
  const [other] = await sql`
    select id from organizations
    where id not in (select organization_id from organization_members m join users u on u.id = m.user_id where u.name = ${`Know404 ${suffix}`})
    limit 1`;
  test.skip(!other, "needs a second organization");
  const foreignId = await seedDocument(other.id, `Ajeno ${suffix}`);

  const response = await page.goto(`/knowledge/${foreignId}`);
  expect(response?.status()).toBe(404);
});

async function openUploadSheet(page: import("@playwright/test").Page) {
  await page.goto("/knowledge");
  await page.getByRole("button", { name: "Añadir conocimiento" }).click();
  const picker = page.getByRole("dialog", { name: "Añadir conocimiento" });
  await picker.getByLabel("Tipo de conocimiento").selectOption("DOCUMENT");
  await picker.getByRole("button", { name: "Continuar" }).click();
  return page.getByRole("dialog", { name: "Añadir documento" });
}

async function fillVersion(dialog: import("@playwright/test").Locator, version = "2024") {
  await dialog.getByLabel("Versión", { exact: true }).fill(version);
  await dialog.getByLabel("En vigor desde").fill("2024-01-10");
  await dialog.getByLabel("Nota de fuente").fill("BOE núm. 5");
}

test("an ADMIN uploads a text file and a new version, and the content becomes searchable with its citation", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const title = `Protocolo ${suffix}`;
  await register(page, `Upload ${suffix}`);

  const dialog = await openUploadSheet(page);
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByLabel("Jurisdicción").fill("ES");
  await dialog.getByLabel("Origen").selectOption("TEXT");
  await dialog.getByLabel("Archivo").setInputFiles({
    name: "protocolo.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`Artículo 1. La zorroplateada${suffix} es el término único de este protocolo.`),
  });
  await fillVersion(dialog);
  await dialog.getByRole("button", { name: "Subir documento" }).click();

  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText("Versión 2024")).toBeVisible();
  await expect(page.getByText(`zorroplateada${suffix}`)).toBeVisible();

  // A second version via the document page.
  await page.getByLabel("Origen").selectOption("TEXT");
  await page.getByLabel("Archivo").setInputFiles({
    name: "v2.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(`Artículo 1. La nueva redacción de zorroplateada${suffix} cambia.`),
  });
  await page.getByLabel("Versión", { exact: true }).fill("2025");
  await page.getByLabel("En vigor desde").fill("2025-01-01");
  await page.getByRole("button", { name: "Subir versión" }).click();
  await expect(page.getByText("Versión 2025")).toBeVisible();
  await expect(page.getByText("Sustituida")).toBeVisible();

  // Searchable, with provenance.
  await page.goto("/knowledge");
  await page.getByRole("searchbox", { name: "Buscar en el conocimiento" }).fill(`zorroplateada${suffix}`);
  await page.getByRole("button", { name: "Buscar" }).click();
  const results = page.getByRole("list", { name: "Resultados de la búsqueda" });
  // k-NN returns neighbours from every document in the shared test DB: pick ours.
  const ours = results.getByRole("listitem").filter({ hasText: title });
  await expect(ours.getByText("Versión 2025")).toBeVisible();
  await expect(ours.getByText("Vigente", { exact: true })).toBeVisible();
  await expect(ours.getByText("BOE núm. 5")).toBeVisible();

  // The sources list shows it as indexed, counts the indexed text, and filters by title and type.
  await page.goto("/knowledge");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row.getByText("Indexado", { exact: true })).toBeVisible();
  await expect(page.getByText("Caracteres indexados")).toBeVisible();

  await page.getByLabel("Filtrar por título").fill(title);
  await page.getByLabel("Tipo de fuente").selectOption("MANUAL");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("row").filter({ hasText: title })).toHaveCount(1);

  await page.getByLabel("Tipo de fuente").selectOption("PDF");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("row").filter({ hasText: title })).toHaveCount(0);
  await expect(page.getByText("Ninguna fuente coincide")).toBeVisible();
});

test("uploading a PDF works; a fake PDF is refused with a message", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  await register(page, `UploadPdf ${suffix}`);

  // Not a PDF despite the name.
  let dialog = await openUploadSheet(page);
  await dialog.getByLabel("Título").fill(`Falso ${suffix}`);
  await dialog.getByLabel("Archivo").setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("hola") });
  await fillVersion(dialog);
  await dialog.getByRole("button", { name: "Subir documento" }).click();
  await expect(dialog.getByText("El archivo no es un PDF válido.")).toBeVisible();

  // Nothing half-created was left behind.
  await page.goto("/knowledge");
  await expect(page.getByText(`Falso ${suffix}`)).toHaveCount(0);

  // A real PDF goes through.
  dialog = await openUploadSheet(page);
  await dialog.getByLabel("Título").fill(`Real ${suffix}`);
  await dialog.getByLabel("Archivo").setInputFiles("tests/fixtures/knowledge/sample.pdf");
  await fillVersion(dialog);
  await dialog.getByRole("button", { name: "Subir documento" }).click();
  await expect(page.getByRole("heading", { name: `Real ${suffix}`, level: 1 })).toBeVisible();
  await expect(page.getByText("Contenido de prueba.")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, "/knowledge/[id] con formulario de versión");
});

test("an ADMIN manages a website source from its panel", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  await register(page, `Site ${suffix}`);
  const [org] = await sql`
    select o.id from organizations o
    join organization_members m on m.organization_id = o.id
    join users u on u.id = m.user_id
    where u.name = ${`Site ${suffix}`} limit 1`;

  // A site seeded in SQL with 12 pages: one indexed, one failed, ten not indexed yet.
  const host = `ejemplo-${suffix}.org`;
  const documentId = await seedDocument(org.id, `Página indexada ${suffix}`);
  const options = sql.json({
    version: "2024",
    status: "CURRENT",
    effectiveFrom: "2024-01-10",
    effectiveUntil: null,
    sourceNote: null,
    jurisdiction: "ES",
    territory: null,
    scope: null,
  });
  const [site] = await sql`
    insert into knowledge_websites (organization_id, url, title, discovery_source, discovered_at, options)
    values (${org.id}, ${`https://${host}/`}, ${`Sitio ${suffix}`}, 'sitemap', now(), ${options}) returning id`;
  for (let i = 1; i <= 12; i++) {
    const url = `https://${host}/pagina-${String(i).padStart(2, "0")}`;
    const status = i === 1 ? "INDEXED" : i === 2 ? "FAILED" : "DISCOVERED";
    const error = i === 2 ? "No se pudo descargar la página. Comprueba que es pública y accesible." : null;
    await sql`
      insert into knowledge_website_pages (website_id, organization_id, url, status, error, document_id)
      values (${site.id}, ${org.id}, ${url}, ${status}, ${error}, ${i === 1 ? documentId : null})`;
  }

  // The list shows the site; opening it shows the panel with its three tabs.
  await page.goto("/knowledge");
  await expect(page.getByText("1 de 12 indexadas")).toBeVisible();
  await expect(page.getByText("1 con error", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: `Sitio ${suffix}` }).click();
  const panel = page.getByRole("dialog", { name: `Sitio ${suffix}` });
  await expect(panel.getByRole("tab", { name: "Información" })).toBeVisible();
  await expect(panel.getByRole("tab", { name: "Páginas" })).toBeVisible();
  await expect(panel.getByRole("tab", { name: "Configuración" })).toBeVisible();

  // Información: preview placeholder (no og:image), counts and where the pages came from.
  await expect(panel.getByText("12 encontradas")).toBeVisible();
  await expect(panel.getByText("1 indexadas")).toBeVisible();
  await expect(panel.getByText("Sitemap del sitio")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, "/knowledge?sitio=[id]");

  // Páginas: ten at a time, a selector for more, next page, and a search.
  await panel.getByRole("tab", { name: "Páginas" }).click();
  await expect(panel.getByText("1–10 de 12")).toBeVisible();
  await expect(panel.getByText("/pagina-10", { exact: true })).toBeVisible();
  await expect(panel.getByText("/pagina-11", { exact: true })).toHaveCount(0);

  await panel.getByLabel("Páginas por tabla").selectOption("25");
  await expect(panel.getByText("1–12 de 12")).toBeVisible();
  await expect(panel.getByText("/pagina-11", { exact: true })).toBeVisible();
  await panel.getByLabel("Páginas por tabla").selectOption("10");
  await panel.getByRole("button", { name: "Siguiente" }).click();
  await expect(panel.getByText("11–12 de 12")).toBeVisible();
  await expect(panel.getByText("/pagina-11", { exact: true })).toBeVisible();

  await panel.getByLabel("Buscar una página").fill("pagina-07");
  await expect(panel.getByText("1–1 de 1")).toBeVisible();
  await expect(panel.getByText("/pagina-07", { exact: true })).toBeVisible();
  await expect(panel.getByText("/pagina-08", { exact: true })).toHaveCount(0);

  // Choosing pages: an indexed page cannot be chosen again; a pending one can.
  await expect(panel.getByRole("button", { name: "Indexar páginas" })).toBeDisabled();
  await panel.getByLabel("Indexar /pagina-07").check();
  await expect(panel.getByText("1 de 30 seleccionadas")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Indexar 1 página", exact: true })).toBeEnabled();
  await panel.getByLabel("Buscar una página").fill("pagina-01");
  await expect(panel.getByLabel("Indexar /pagina-01")).toBeDisabled();
  await panel.getByLabel("Buscar una página").fill("pagina-02");
  await expect(panel.getByText("No se pudo descargar la página. Comprueba que es pública y accesible.")).toBeVisible();
  await expect(panel.getByLabel("Indexar /pagina-02")).toBeEnabled();

  // Adding a page by address: only from the same site.
  await panel.getByLabel("Dirección de la página a añadir").fill(`https://otro-${suffix}.org/x`);
  await panel.getByRole("button", { name: "Añadir", exact: true }).click();
  await expect(panel.getByText("La página debe ser del mismo sitio web.")).toBeVisible();
  await panel.getByLabel("Dirección de la página a añadir").fill(`https://${host}/manual`);
  await panel.getByRole("button", { name: "Añadir", exact: true }).click();
  await panel.getByLabel("Buscar una página").fill("manual");
  await expect(panel.getByText("/manual", { exact: true })).toBeVisible();

  // Configuración: the publication data is editable.
  await panel.getByRole("tab", { name: "Configuración" }).click();
  await panel.getByLabel("Versión", { exact: true }).fill("v2");
  await panel.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(panel.getByText("Cambios guardados.")).toBeVisible();
  const [saved] = await sql`select options from knowledge_websites where id = ${site.id}`;
  expect(saved.options.version).toBe("v2");

  // Danger zone: deleting the site, and its indexed document if asked.
  await panel.getByRole("button", { name: "Eliminar sitio web" }).click();
  const confirm = page.getByRole("dialog", { name: "Eliminar sitio web" });
  await confirm.getByLabel(/También eliminar los 1 documento indexado/).check();
  await confirm.getByRole("button", { name: "Eliminar sitio web" }).click();
  await expect(page).not.toHaveURL(/sitio=/);
  await expect(page.getByRole("link", { name: `Sitio ${suffix}` })).toHaveCount(0);
  const [{ count }] = await sql`select count(*)::int as count from knowledge_documents where id = ${documentId}`;
  expect(count).toBe(0);
});

test("adding a website refuses a private address, and another organization's site has no panel", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  await register(page, `AddSite ${suffix}`);

  await page.goto("/knowledge");
  await page.getByRole("button", { name: "Añadir conocimiento" }).click();
  const picker = page.getByRole("dialog", { name: "Añadir conocimiento" });
  await expect(picker.getByLabel("Tipo de conocimiento")).toHaveValue("WEBSITE");
  await picker.getByLabel("Dirección del sitio web").fill("http://127.0.0.1:3000/");
  await picker.getByRole("button", { name: "Añadir sitio web" }).click();
  await expect(picker.getByText("No se pudo acceder al sitio. Comprueba que la dirección es pública y accesible.")).toBeVisible();

  const [other] = await sql`insert into organizations (name) values (${`Otra sitio ${suffix}`}) returning id`;
  const [foreign] = await sql`
    insert into knowledge_websites (organization_id, url, title, options)
    values (${other.id}, ${`https://ajeno-${suffix}.org/`}, ${`Ajeno ${suffix}`}, ${sql.json({ version: "1", status: "CURRENT", effectiveFrom: "2024-01-01", effectiveUntil: null, sourceNote: null, jurisdiction: null, territory: null, scope: null })})
    returning id`;
  await page.goto(`/knowledge?sitio=${foreign.id}`);
  await expect(page.getByRole("heading", { name: "Conocimiento", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Páginas" })).toHaveCount(0);
  await expect(page.getByText(`Ajeno ${suffix}`)).toHaveCount(0);
});

test("a DELEGATE is offered no way to upload", async ({ page, browser }) => {
  const suffix = randomUUID().slice(0, 8);
  await register(page, `AdminUp ${suffix}`);
  const email = `${randomUUID()}@example.com`;
  await page.goto("/organization/members");
  await page.getByRole("button", { name: "Invitar" }).click();
  const invite = page.getByRole("dialog");
  await invite.getByLabel("Email").fill(email);
  await invite.getByLabel("Rol").selectOption("DELEGATE");
  await invite.getByRole("button", { name: "Invitar" }).click();
  await expect(page.getByText(email)).toBeVisible();
  const [invitation] = await sql`select token from organization_invitations where email = ${email} limit 1`;

  const context = await browser.newContext();
  const delegate = await context.newPage();
  await delegate.goto(`/invite/${invitation.token}`);
  await delegate.getByPlaceholder("Nombre").fill(`Delegate ${suffix}`);
  await delegate.getByPlaceholder("Contraseña").fill("correcthorsebattery");
  await delegate.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(delegate).toHaveURL(/\/inbox$/);

  await delegate.goto("/knowledge");
  await expect(delegate.getByRole("heading", { name: "Conocimiento", level: 1 })).toBeVisible();
  await expect(delegate.getByRole("button", { name: "Añadir conocimiento" })).toHaveCount(0);
  await context.close();
});
