import "dotenv/config";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expectNoSeriousAccessibilityViolations } from "./axe-helpers";

/**
 * Altas de afiliados por webhook: the ADMIN creates the integration key,
 * the automation posts an alta, and the ADMIN sees the notice, the proposed
 * delegate with everyone's load, and confirms the assignment.
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

async function organizationOf(name: string): Promise<string> {
  const [org] = await sql`
    select m.organization_id as id from organization_members m
    join users u on u.id = m.user_id where u.name = ${name} limit 1`;
  return org.id as string;
}

async function addDelegate(organizationId: string, name: string) {
  const id = randomUUID();
  await sql`insert into users (id, name, email, email_verified) values (${id}, ${name}, ${`${id}@example.com`}, true)`;
  await sql`insert into organization_members (organization_id, user_id, role) values (${organizationId}, ${id}, 'DELEGATE')`;
  return id;
}

const alta = (dni: string, nombre: string) => ({
  tipoSolicitud: "alta",
  validoParaProcesar: true,
  errores: [],
  afiliado: {
    nombre,
    apellidos: "OSUNA GÓMEZ",
    dni,
    fechaNacimiento: "03-09-1982",
    telefono: "656311794",
    email: "victoria@example.com",
    domicilio: { tipoVia: "Calle", direccion: "CAPITÁN DEMA", numero: "20", codigoPostal: "03007", poblacion: "ALACANT/ALICANTE" },
    afiliacion: { sector: "Educación", cuotaMensual: "11.5 €", centroTrabajo: "IES MARENOSTRUM" },
  },
});

test("key, webhook, notice, proposal and confirmation", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const adminName = `Intake ${suffix}`;
  await register(page, adminName);
  const organizationId = await organizationOf(adminName);
  const ana = `Ana ${suffix}`;
  const luis = `Luis ${suffix}`;
  await addDelegate(organizationId, ana);
  await addDelegate(organizationId, luis);

  // The ADMIN creates the key; the token is shown once.
  await page.goto("/organization/integrations");
  await expect(page.getByRole("heading", { name: "Integraciones", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Endpoint")).toHaveValue(/\/api\/integrations\/affiliate-requests$/);
  await expectNoSeriousAccessibilityViolations(page, "/organization/integrations");
  await page.getByRole("button", { name: "Crear clave" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Crear clave" }).click();
  const token = await page.getByLabel("Clave de integración").inputValue();
  expect(token).toMatch(/^kly_/);
  await page.getByRole("button", { name: "Ya la he guardado" }).click();
  await expect(page.getByRole("cell", { name: `${token.slice(0, 8)}…` })).toBeVisible();

  // No key, wrong key: 401. The alta itself: 202.
  const url = "/api/integrations/affiliate-requests";
  expect((await page.request.post(url, { data: [alta("30958467F", "MARÍA")] })).status()).toBe(401);
  const response = await page.request.post(url, {
    headers: { Authorization: `Bearer ${token}` },
    data: [alta("30958467F", "MARÍA"), alta("11111111H", "JUAN")],
  });
  expect(response.status()).toBe(202);
  expect((await response.json()).results.map((r: { status: string }) => r.status)).toEqual(["RECEIVED", "RECEIVED"]);

  // The notice: toast with the action and the badge in the sidebar.
  await page.goto("/inbox");
  const toast = page.getByText("Tienes 2 altas pendientes de asignar");
  await expect(toast).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Principal" }).getByText("2 altas pendientes")).toBeAttached();
  await page.getByRole("button", { name: "Revisar" }).first().click();
  await expect(page).toHaveURL(/\/affiliate-requests$/);
  await expect(page.getByRole("heading", { name: "Altas", level: 1 })).toBeVisible();
  await expect(page.getByText("María Victoria Osuna Gómez").or(page.getByText("María Osuna Gómez"))).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, "/affiliate-requests");

  // The first alta is proposed to Ana, the second to Luis (load 0/0, then 1/0).
  const maria = page.getByRole("row").filter({ hasText: "30958467F" });
  await expect(maria.getByText(ana)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "11111111H" }).getByText(luis)).toBeVisible();

  // The sheet shows the load of each delegate; the admin picks Luis instead.
  await maria.getByRole("button", { name: "Revisar" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("radio", { name: new RegExp(ana) })).toBeChecked();
  await expect(sheet.getByRole("row", { name: new RegExp(luis) })).toContainText("1");
  await expectNoSeriousAccessibilityViolations(page, "/affiliate-requests sheet");
  await sheet.getByRole("radio", { name: new RegExp(luis) }).check();
  await sheet.getByRole("button", { name: "Confirmar asignación" }).click();
  await expect(page.getByRole("row").filter({ hasText: "30958467F" })).toHaveCount(0);

  const [assigned] = await sql`
    select u.name from contact_assignments ca
    join users u on u.id = ca.delegate_id
    join affiliate_profiles p on p.contact_id = ca.contact_id
    where ca.organization_id = ${organizationId} and p.dni = '30958467F' and ca.ended_at is null`;
  expect(assigned.name).toBe(luis);

  // A resend of the second one is the same request; a confirmed DNI comes back as duplicate.
  const resend = await page.request.post(url, {
    headers: { Authorization: `Bearer ${token}` },
    data: [alta("11111111H", "JUAN"), alta("30958467F", "MARÍA")],
  });
  const results = (await resend.json()).results as { status: string; repeated: boolean }[];
  expect(results.map((r) => [r.status, r.repeated])).toEqual([["RECEIVED", true], ["DUPLICATE", false]]);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Posibles duplicados" })).toBeVisible();
  await page.getByRole("button", { name: "Descartar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Descartar alta" }).click();
  await expect(page.getByRole("heading", { name: "Posibles duplicados" })).toHaveCount(0);

  // Confirm what is left with its proposal (one request: the single-row sheet path).
  await page.getByRole("button", { name: "Revisar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar asignación" }).click();
  await expect(page.getByText("No hay altas pendientes")).toBeVisible();
});

test("a DELEGATE neither sees the Altas item nor the pages", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const name = `Deleg ${suffix}`;
  await register(page, name);
  // Demote to DELEGATE after the fact (a second ADMIN is not needed for this check).
  await sql`update organization_members set role = 'DELEGATE' where user_id = (select id from users where name = ${name})`;
  await page.goto("/inbox");
  await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Altas" })).toHaveCount(0);
  expect((await page.goto("/affiliate-requests"))?.status()).toBe(404);
  expect((await page.goto("/organization/integrations"))?.status()).toBe(404);
});
