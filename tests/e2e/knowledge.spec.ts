import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expectNoSeriousAccessibilityViolations } from "./axe-helpers";

/**
 * Fase 7e — Knowledge UI: document list (GLOBAL + own organization, never
 * another's), document detail with versions/vigencia/chunks, and the
 * search box's graceful degradation when no EmbeddingProvider is
 * configured (none is in E2E). Data seeded by SQL: there is no ingestion
 * UI yet. The embedding is a zero vector — search itself is covered by
 * `tests/integration/knowledge-retrieval.test.ts`.
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
    insert into knowledge_chunks (document_version_id, document_id, organization_id, visibility, ordinal, level, label, content, embedding)
    values (${version.id}, ${doc.id}, ${organizationId}, ${visibility}, 1, 'ARTICLE', '12', ${`Texto del artículo de ${title}`},
            array_fill(0, array[1536])::vector)`;
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
  await expect(page.getByText("Vigente")).toBeVisible();
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

test("search says so when the embedding service is not configured", async ({ page }) => {
  await register(page, `KnowSearch ${randomUUID().slice(0, 8)}`);
  await page.goto("/knowledge");
  await page.getByRole("searchbox", { name: "Buscar en el conocimiento" }).fill("baja");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("La búsqueda no está disponible")).toBeVisible();
});
