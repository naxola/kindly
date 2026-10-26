import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { contacts } from "@/modules/contacts/schema";
import { memberships } from "@/modules/memberships/schema";
import { getContactForMember } from "@/modules/contacts/service";
import { getActiveAssignment } from "@/modules/contacts/assignments";
import { affiliateProfiles, affiliateRequests, integrationKeys } from "@/modules/affiliates/schema";
import { createIntegrationKey, listIntegrationKeys, revokeIntegrationKey } from "@/modules/affiliates/integration-keys";
import { handleAffiliateIntake } from "@/modules/affiliates/intake-endpoint";
import {
  applyDuplicateRequest,
  confirmAllWithProposal,
  confirmRequest,
  countOpenRequests,
  discardRequest,
  getDelegateLoads,
  listOpenRequests,
} from "@/modules/affiliates/requests";

/** Altas received from n8n, the delegate proposal and the admin's decisions — against real PostgreSQL. */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations") });
});
afterAll(async () => {
  await client.end();
});

async function user(name: string) {
  const [row] = await db.insert(users).values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` }).returning();
  return row;
}

async function setup() {
  const [org] = await db.insert(organizations).values({ name: `org-intake-${randomUUID()}` }).returning();
  const admin = await user("Admin");
  const ana = await user("Ana");
  const luis = await user("Luis");
  // Inserted one by one so `createdAt` gives the fixed tie-break order: Ana, then Luis.
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: admin.id, role: "ADMIN" });
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: ana.id, role: "DELEGATE" });
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: luis.id, role: "DELEGATE" });
  const { token } = await createIntegrationKey({ organizationId: org.id, createdBy: admin.id, name: "n8n" });
  return { org, admin, ana, luis, token };
}

const alta = (dni: string, extra: Record<string, unknown> = {}) => ({
  tipoSolicitud: "alta",
  validoParaProcesar: true,
  errores: [],
  afiliado: {
    nombre: "MARÍA VICTORIA",
    apellidos: "OSUNA GÓMEZ",
    dni,
    fechaNacimiento: "03-09-1982",
    genero: "Mujer",
    telefono: "656311794",
    email: "victoria@example.com",
    domicilio: { direccion: "CAPITÁN DEMA", codigoPostal: "03007" },
    afiliacion: { sector: "Educación", cuotaMensual: "11.5 €", centroTrabajo: "IES MARENOSTRUM" },
    ...extra,
  },
});

const send = (token: string | null, body: unknown) =>
  handleAffiliateIntake(token ? `Bearer ${token}` : null, JSON.stringify(body));

describe("integration keys", () => {
  it("stores only a hash, lists the key and stops working once revoked", async () => {
    const { org, token } = await setup();
    const [row] = await db.select().from(integrationKeys).where(eq(integrationKeys.organizationId, org.id));
    expect(row.keyHash).not.toContain(token);
    expect(token.startsWith(row.keyPrefix)).toBe(true);

    expect((await send(token, [alta("30958467F")])).status).toBe(202);
    const [listed] = await listIntegrationKeys(org.id);
    expect(listed.lastUsedAt).not.toBeNull();

    expect(await revokeIntegrationKey(org.id, listed.id)).toBe(true);
    expect((await send(token, [alta("11111111H")])).status).toBe(401);
  });

  it("rejects missing, malformed and unknown tokens, and cannot revoke another organization's key", async () => {
    const a = await setup();
    const b = await setup();
    expect((await send(null, [])).status).toBe(401);
    expect((await handleAffiliateIntake("Basic abc", "[]")).status).toBe(401);
    expect((await send("kly_nope", [alta("30958467F")])).status).toBe(401);
    const [keyOfA] = await listIntegrationKeys(a.org.id);
    expect(await revokeIntegrationKey(b.org.id, keyOfA.id)).toBe(false);
  });
});

describe("POST payload handling", () => {
  it("accepts the n8n array, answers per item and tolerates a single object", async () => {
    const { token } = await setup();
    const response = await send(token, [alta("30958467F"), { ...alta("22222222J"), tipoSolicitud: "baja" }, "basura"]);
    expect(response.status).toBe(202);
    const results = (response.body as { results: { index: number; status: string; errors?: string[] }[] }).results;
    expect(results.map((r) => [r.index, r.status])).toEqual([[0, "RECEIVED"], [1, "INVALID"], [2, "INVALID"]]);
    expect(results[1].errors?.length).toBeGreaterThan(0);

    const single = await send(token, alta("33333333P"));
    expect((single.body as { results: { status: string }[] }).results[0].status).toBe("RECEIVED");
  });

  it("rejects non-JSON, empty and oversized payloads", async () => {
    const { token } = await setup();
    expect((await handleAffiliateIntake(`Bearer ${token}`, "no json")).status).toBe(400);
    expect((await send(token, [])).status).toBe(400);
    expect((await send(token, Array.from({ length: 51 }, () => alta("30958467F")))).status).toBe(400);
    expect((await handleAffiliateIntake(`Bearer ${token}`, "x".repeat(600 * 1024))).status).toBe(413);
  });
});

describe("reception", () => {
  it("creates the contact, profile and membership, unassigned and hidden from delegates, and proposes a delegate", async () => {
    const { org, admin, ana, token } = await setup();
    const response = await send(token, [alta("30958467F")]);
    const { requestId } = (response.body as { results: { requestId: string }[] }).results[0];

    const [request] = await db.select().from(affiliateRequests).where(eq(affiliateRequests.id, requestId));
    expect(request).toMatchObject({ status: "PENDING", organizationId: org.id, proposedDelegateId: ana.id });
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, request.contactId!));
    expect(contact).toMatchObject({ name: "María Victoria Osuna Gómez", phoneE164: "+34656311794", isUnassigned: false });
    const [profile] = await db.select().from(affiliateProfiles).where(eq(affiliateProfiles.contactId, contact.id));
    expect(profile).toMatchObject({ dni: "30958467F", birthDate: "1982-09-03", monthlyFeeCents: 1150, street: "CAPITÁN DEMA" });
    const [membership] = await db.select().from(memberships).where(eq(memberships.contactId, contact.id));
    expect(membership.status).toBe("ACTIVE");

    expect(await getActiveAssignment(org.id, contact.id)).toBeNull();
    expect(await getContactForMember(org.id, { userId: admin.id, role: "ADMIN" }, contact.id)).not.toBeNull();
    expect(await getContactForMember(org.id, { userId: ana.id, role: "DELEGATE" }, contact.id)).toBeNull();
    expect(await countOpenRequests(org.id)).toBe(1);
  });

  it("spreads proposals by load: pending proposals count, ties follow the join order", async () => {
    const { org, ana, luis, token } = await setup();
    const proposed: string[] = [];
    for (const dni of ["30958467F", "11111111H", "22222222J"]) {
      await send(token, [alta(dni)]);
      const rows = await listOpenRequests(org.id);
      proposed.push(rows[rows.length - 1].proposedDelegateId!);
    }
    expect(proposed).toEqual([ana.id, luis.id, ana.id]);
    const loads = await getDelegateLoads(org.id);
    expect(loads.map((l) => [l.name, l.assigned, l.pending])).toEqual([["Ana", 0, 2], ["Luis", 0, 1]]);
  });

  it("answers a resend of an open alta with the same request and creates nothing new", async () => {
    const { org, token } = await setup();
    const first = (await send(token, [alta("30958467F")])).body as { results: { requestId: string }[] };
    const second = (await send(token, [alta("30958467f")])).body as { results: { requestId: string; repeated: boolean }[] };
    expect(second.results[0]).toMatchObject({ status: "RECEIVED", requestId: first.results[0].requestId, repeated: true });
    expect(await db.select().from(contacts).where(eq(contacts.organizationId, org.id))).toHaveLength(1);
  });

  it("works without delegates: pending with no proposal", async () => {
    const [org] = await db.insert(organizations).values({ name: `org-solo-${randomUUID()}` }).returning();
    const admin = await user("Solo");
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: admin.id, role: "ADMIN" });
    const { token } = await createIntegrationKey({ organizationId: org.id, createdBy: admin.id, name: "n8n" });
    await send(token, [alta("30958467F")]);
    const [row] = await listOpenRequests(org.id);
    expect(row.proposedDelegateId).toBeNull();
  });
});

describe("admin decisions", () => {
  it("confirming assigns the contact to the chosen delegate, who then sees it, and cannot be repeated", async () => {
    const { org, admin, ana, luis, token } = await setup();
    await send(token, [alta("30958467F")]);
    const [row] = await listOpenRequests(org.id);

    expect(await confirmRequest(org.id, admin.id, row.id, admin.id)).toEqual({ ok: false, error: "Elige un delegado de la organización." });
    expect(await confirmRequest(org.id, admin.id, row.id, luis.id)).toEqual({ ok: true });
    expect((await getActiveAssignment(org.id, row.contactId!))?.delegateId).toBe(luis.id);
    expect(await getContactForMember(org.id, { userId: luis.id, role: "DELEGATE" }, row.contactId!)).not.toBeNull();
    expect(await getContactForMember(org.id, { userId: ana.id, role: "DELEGATE" }, row.contactId!)).toBeNull();

    expect((await confirmRequest(org.id, admin.id, row.id, ana.id)).ok).toBe(false);
    expect(await countOpenRequests(org.id)).toBe(0);
    const loads = await getDelegateLoads(org.id);
    expect(loads.find((l) => l.userId === luis.id)).toMatchObject({ assigned: 1, pending: 0 });
  });

  it("confirms everything with the proposals in one go", async () => {
    const { org, admin, token } = await setup();
    await send(token, [alta("30958467F"), alta("11111111H"), alta("22222222J")]);
    expect(await confirmAllWithProposal(org.id, admin.id)).toBe(3);
    const loads = await getDelegateLoads(org.id);
    expect(loads.map((l) => l.assigned)).toEqual([2, 1]);
    expect(await countOpenRequests(org.id)).toBe(0);
  });

  it("discarding a pending alta removes its contact; a contact with history stays", async () => {
    const { org, admin, token } = await setup();
    await send(token, [alta("30958467F"), alta("11111111H")]);
    const [first, second] = await listOpenRequests(org.id);

    expect(await discardRequest(org.id, admin.id, first.id)).toEqual({ ok: true });
    expect(await db.select().from(contacts).where(eq(contacts.id, first.contactId!))).toHaveLength(0);

    // A case hangs from the second contact, so only the request is closed.
    await db.insert(schema.cases).values({ organizationId: org.id, contactId: second.contactId!, title: "Consulta" });
    expect(await discardRequest(org.id, admin.id, second.id)).toEqual({ ok: true });
    expect(await db.select().from(contacts).where(eq(contacts.id, second.contactId!))).toHaveLength(1);
    expect((await discardRequest(org.id, admin.id, second.id)).ok).toBe(false);
    expect(await countOpenRequests(org.id)).toBe(0);
  });

  it("a known DNI is flagged as duplicate; the admin can discard it or apply its data", async () => {
    const { org, admin, ana, token } = await setup();
    await send(token, [alta("30958467F")]);
    const [original] = await listOpenRequests(org.id);
    await confirmRequest(org.id, admin.id, original.id, ana.id);

    const response = await send(token, [alta("30958467F", { telefono: "611222333", nombre: "MARÍA" })]);
    expect((response.body as { results: { status: string }[] }).results[0].status).toBe("DUPLICATE");
    const [duplicate] = await listOpenRequests(org.id);
    expect(duplicate).toMatchObject({ status: "DUPLICATE", contactId: null, duplicateOfContactId: original.contactId, duplicateOfName: "María Victoria Osuna Gómez" });
    expect(await db.select().from(contacts).where(eq(contacts.organizationId, org.id))).toHaveLength(1);

    expect(await applyDuplicateRequest(org.id, admin.id, duplicate.id)).toEqual({ ok: true });
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, original.contactId!));
    expect(contact).toMatchObject({ name: "María Osuna Gómez", phoneE164: "+34611222333" });
    // Applying the data does not touch who the affiliate is assigned to.
    expect((await getActiveAssignment(org.id, original.contactId!))?.delegateId).toBe(ana.id);

    await send(token, [alta("30958467F")]);
    const [again] = await listOpenRequests(org.id);
    expect(await discardRequest(org.id, admin.id, again.id)).toEqual({ ok: true });
    expect(await db.select().from(contacts).where(eq(contacts.id, original.contactId!))).toHaveLength(1);
  });
});

describe("tenancy", () => {
  it("keeps altas, DNIs and decisions inside their own organization", async () => {
    const a = await setup();
    const b = await setup();
    await send(a.token, [alta("30958467F")]);
    // The same DNI in another organization is a different affiliate, not a duplicate.
    const sameDni = await send(b.token, [alta("30958467F")]);
    expect((sameDni.body as { results: { status: string }[] }).results[0].status).toBe("RECEIVED");

    const [rowA] = await listOpenRequests(a.org.id);
    expect(await listOpenRequests(b.org.id)).toHaveLength(1);
    // B's admin cannot resolve A's request, nor assign to A's delegate.
    expect((await confirmRequest(b.org.id, b.admin.id, rowA.id, b.ana.id)).ok).toBe(false);
    expect((await discardRequest(b.org.id, b.admin.id, rowA.id)).ok).toBe(false);
    const [rowB] = await listOpenRequests(b.org.id);
    expect((await confirmRequest(b.org.id, b.admin.id, rowB.id, a.ana.id)).ok).toBe(false);
    expect(await countOpenRequests(a.org.id)).toBe(1);
  });
});
