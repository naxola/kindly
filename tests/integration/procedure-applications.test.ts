import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";
import { activities } from "@/modules/audit/schema";
import { createContact } from "@/modules/contacts/service";
import { createCase } from "@/modules/cases/service";
import { createProcedure, publishProcedureVersion } from "@/modules/procedures/service";
import {
  closeApplication,
  getApplicationContactId,
  listApplicationsForContact,
  listStartableProcedures,
  ProcedureApplicationError,
  setDocumentReceived,
  startProcedureApplication,
} from "@/modules/procedures/applications";

/** Integration tests for procedures in progress for a Contact (UI-10c) against real PostgreSQL. */

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

async function setup() {
  const [org] = await db.insert(organizations).values({ name: `org-app-${randomUUID()}` }).returning();
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name: "Admin", email: `${randomUUID()}@example.com`, emailVerified: true })
    .returning();
  const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Marta" });
  const procedure = await createProcedure({
    organizationId: org.id,
    actorUserId: user.id,
    name: "Reagrupación familiar",
    steps: ["Revisar documentos", "Presentar solicitud"],
    requiredDocuments: ["Pasaporte", "Certificado de empadronamiento", "Contrato de trabajo"],
  });
  return { org, user, contact, procedure };
}

describe("startProcedureApplication", () => {
  it("opens a procedure under its current version with every required document waiting", async () => {
    const { org, user, contact, procedure } = await setup();
    const application = await startProcedureApplication({
      organizationId: org.id,
      actorUserId: user.id,
      contactId: contact.id,
      procedureId: procedure.id,
    });

    const [view] = await listApplicationsForContact(org.id, contact.id);
    expect(view).toMatchObject({ id: application.id, procedureName: "Reagrupación familiar", version: 1, status: "ACTIVE", caseId: null });
    expect(view.documents.map((d) => [d.name, d.status])).toEqual([
      ["Pasaporte", "REQUIRED"],
      ["Certificado de empadronamiento", "REQUIRED"],
      ["Contrato de trabajo", "REQUIRED"],
    ]);
    expect(await getApplicationContactId(org.id, application.id)).toBe(contact.id);

    const [activity] = await db.select().from(activities).where(and(eq(activities.entityId, contact.id), eq(activities.type, "PROCEDURE_STARTED")));
    expect(activity).toMatchObject({ organizationId: org.id, actorUserId: user.id });
  });

  it("keeps the version it started under when the procedure is edited afterwards", async () => {
    const { org, user, contact, procedure } = await setup();
    await startProcedureApplication({ organizationId: org.id, actorUserId: user.id, contactId: contact.id, procedureId: procedure.id });
    await publishProcedureVersion({
      organizationId: org.id,
      actorUserId: user.id,
      procedureId: procedure.id,
      steps: ["Nuevo paso"],
      requiredDocuments: ["Solo un documento"],
    });

    const [view] = await listApplicationsForContact(org.id, contact.id);
    expect(view.version).toBe(1);
    expect(view.documents).toHaveLength(3);
    // The newly published version is what a *new* application would use.
    const second = await setup();
    expect(await listStartableProcedures(second.org.id, second.contact.id)).toHaveLength(1);
  });

  it("allows one open procedure of each kind per contact, and again once it is closed", async () => {
    const { org, user, contact, procedure } = await setup();
    const input = { organizationId: org.id, actorUserId: user.id, contactId: contact.id, procedureId: procedure.id };
    const first = await startProcedureApplication(input);
    await expect(startProcedureApplication(input)).rejects.toThrow(/Ya hay un trámite en curso/);
    expect((await listStartableProcedures(org.id, contact.id)).map((p) => p.id)).not.toContain(procedure.id);

    await closeApplication({ organizationId: org.id, actorUserId: user.id, applicationId: first.id, status: "CANCELLED" });
    expect((await listStartableProcedures(org.id, contact.id)).map((p) => p.id)).toContain(procedure.id);
    await expect(startProcedureApplication(input)).resolves.toBeTruthy();
  });

  it("links a case only if it belongs to the same contact", async () => {
    const { org, user, contact, procedure } = await setup();
    const other = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Otra persona" });
    const ownCase = await createCase({ organizationId: org.id, actorUserId: user.id, contactId: contact.id, title: "Expediente" });
    const foreignCase = await createCase({ organizationId: org.id, actorUserId: user.id, contactId: other.id, title: "De otra persona" });
    const input = { organizationId: org.id, actorUserId: user.id, contactId: contact.id, procedureId: procedure.id };

    await expect(startProcedureApplication({ ...input, caseId: foreignCase.id })).rejects.toThrow(/no pertenece a este contacto/);
    const ok = await startProcedureApplication({ ...input, caseId: ownCase.id });
    expect((await listApplicationsForContact(org.id, contact.id)).find((a) => a.id === ok.id)?.caseId).toBe(ownCase.id);
  });

  it("refuses a contact or a procedure of another organization", async () => {
    const a = await setup();
    const b = await setup();
    const base = { organizationId: a.org.id, actorUserId: a.user.id };
    await expect(startProcedureApplication({ ...base, contactId: b.contact.id, procedureId: a.procedure.id })).rejects.toThrow(ProcedureApplicationError);
    await expect(startProcedureApplication({ ...base, contactId: a.contact.id, procedureId: b.procedure.id })).rejects.toThrow(/no existe/);
    expect(await listApplicationsForContact(a.org.id, b.contact.id)).toEqual([]);
  });
});

describe("documents of a procedure in progress", () => {
  async function started() {
    const ctx = await setup();
    const application = await startProcedureApplication({
      organizationId: ctx.org.id,
      actorUserId: ctx.user.id,
      contactId: ctx.contact.id,
      procedureId: ctx.procedure.id,
    });
    const [view] = await listApplicationsForContact(ctx.org.id, ctx.contact.id);
    return { ...ctx, application, view };
  }

  it("marks a document as received with its channel and date, and puts it back to missing", async () => {
    const { org, user, application, view, contact } = await started();
    const passport = view.documents[0];
    await setDocumentReceived({ organizationId: org.id, actorUserId: user.id, applicationId: application.id, documentId: passport.id, received: true, channel: "whatsapp" });

    let [after] = await listApplicationsForContact(org.id, contact.id);
    expect(after.documents[0]).toMatchObject({ status: "RECEIVED", receivedChannel: "whatsapp" });
    expect(after.documents[0].receivedAt).toBeInstanceOf(Date);
    expect(after.documents[1].status).toBe("REQUIRED");

    await setDocumentReceived({ organizationId: org.id, actorUserId: user.id, applicationId: application.id, documentId: passport.id, received: false });
    [after] = await listApplicationsForContact(org.id, contact.id);
    expect(after.documents[0]).toMatchObject({ status: "REQUIRED", receivedAt: null, receivedChannel: null });

    const types = (await db.select().from(activities).where(eq(activities.entityId, contact.id))).map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["PROCEDURE_DOCUMENT_RECEIVED", "PROCEDURE_DOCUMENT_UNMARKED"]));
  });

  it("refuses a document that is not part of this procedure and any change once it is closed", async () => {
    const a = await started();
    const b = await started();
    await expect(
      setDocumentReceived({ organizationId: a.org.id, actorUserId: a.user.id, applicationId: a.application.id, documentId: b.view.documents[0].id, received: true }),
    ).rejects.toThrow(/no pertenece a este trámite/);

    await closeApplication({ organizationId: a.org.id, actorUserId: a.user.id, applicationId: a.application.id, status: "COMPLETED" });
    await expect(
      setDocumentReceived({ organizationId: a.org.id, actorUserId: a.user.id, applicationId: a.application.id, documentId: a.view.documents[0].id, received: true }),
    ).rejects.toThrow(/ya está cerrado/);
    await expect(closeApplication({ organizationId: a.org.id, actorUserId: a.user.id, applicationId: a.application.id, status: "CANCELLED" })).rejects.toThrow(/ya está cerrado/);
    expect(await listApplicationsForContact(a.org.id, a.contact.id)).toEqual([]);
    expect((await listApplicationsForContact(a.org.id, a.contact.id, { includeClosed: true }))[0].status).toBe("COMPLETED");
  });

  it("cannot be touched from another organization", async () => {
    const a = await started();
    const b = await setup();
    await expect(
      setDocumentReceived({ organizationId: b.org.id, actorUserId: b.user.id, applicationId: a.application.id, documentId: a.view.documents[0].id, received: true }),
    ).rejects.toThrow(/no existe/);
    await expect(closeApplication({ organizationId: b.org.id, actorUserId: b.user.id, applicationId: a.application.id, status: "CANCELLED" })).rejects.toThrow(/ya está cerrado o no existe/);
    expect(await getApplicationContactId(b.org.id, a.application.id)).toBeNull();
    expect((await listApplicationsForContact(a.org.id, a.contact.id))[0].documents[0].status).toBe("REQUIRED");
  });
});
