import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";
import { activities } from "@/modules/audit/schema";
import { procedureVersions } from "@/modules/procedures/schema";
import {
  createProcedure,
  getProcedureWithVersions,
  listProcedures,
  publishProcedureVersion,
} from "@/modules/procedures/service";

/** Integration tests for Trámites (Fase 7d) against real PostgreSQL. */

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

async function createOrg(name: string) {
  const [org] = await db.insert(organizations).values({ name: `${name}-${randomUUID()}` }).returning();
  return org;
}

async function createUser() {
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name: "Admin", email: `${randomUUID()}@example.com`, emailVerified: true })
    .returning();
  return user;
}

describe("Procedures (integration)", () => {
  it("creates a procedure with version 1 CURRENT, ordered steps and required documents", async () => {
    const org = await createOrg("org-proc");
    const admin = await createUser();
    const procedure = await createProcedure({
      organizationId: org.id,
      actorUserId: admin.id,
      name: "Baja por IT",
      steps: ["Recibir parte", "Presentar en la mutua"],
      requiredDocuments: ["Parte de baja", "DNI"],
    });

    const found = await getProcedureWithVersions(org.id, procedure.id);
    expect(found?.versions).toHaveLength(1);
    const [v1] = found!.versions;
    expect(v1.version).toBe(1);
    expect(v1.status).toBe("CURRENT");
    expect(v1.steps.map((s) => s.title)).toEqual(["Recibir parte", "Presentar en la mutua"]);
    expect(v1.requiredDocuments.map((d) => d.name)).toEqual(["Parte de baja", "DNI"]);

    const activity = await db.select().from(activities).where(eq(activities.entityId, procedure.id));
    expect(activity.map((a) => a.type)).toContain("PROCEDURE_CREATED");
  });

  it("publishing supersedes the previous CURRENT and keeps exactly one CURRENT", async () => {
    const org = await createOrg("org-proc-v");
    const admin = await createUser();
    const procedure = await createProcedure({
      organizationId: org.id,
      actorUserId: admin.id,
      name: "Alta",
      steps: ["Uno"],
      requiredDocuments: ["DNI"],
    });

    const v2 = await publishProcedureVersion({
      organizationId: org.id,
      actorUserId: admin.id,
      procedureId: procedure.id,
      steps: ["Uno", "Dos"],
      requiredDocuments: ["DNI", "Nómina"],
    });
    expect(v2?.version).toBe(2);

    const found = await getProcedureWithVersions(org.id, procedure.id);
    expect(found!.versions.map((v) => [v.version, v.status])).toEqual([
      [2, "CURRENT"],
      [1, "SUPERSEDED"],
    ]);
    // The past version is untouched by the new one.
    expect(found!.versions[1].requiredDocuments.map((d) => d.name)).toEqual(["DNI"]);

    const current = await db.select().from(procedureVersions).where(eq(procedureVersions.procedureId, procedure.id));
    expect(current.filter((v) => v.status === "CURRENT")).toHaveLength(1);
  });

  it("never reads or publishes across organizations", async () => {
    const orgA = await createOrg("org-a");
    const orgB = await createOrg("org-b");
    const admin = await createUser();
    const procedure = await createProcedure({
      organizationId: orgA.id,
      actorUserId: admin.id,
      name: "Privado de A",
      steps: [],
      requiredDocuments: [],
    });

    expect(await getProcedureWithVersions(orgB.id, procedure.id)).toBeNull();
    expect((await listProcedures(orgB.id)).map((p) => p.id)).not.toContain(procedure.id);
    expect(
      await publishProcedureVersion({
        organizationId: orgB.id,
        actorUserId: admin.id,
        procedureId: procedure.id,
        steps: ["x"],
        requiredDocuments: [],
      }),
    ).toBeNull();
    expect((await getProcedureWithVersions(orgA.id, procedure.id))!.versions).toHaveLength(1);
  });

  it("lists procedures A–Z with their current version", async () => {
    const org = await createOrg("org-list");
    const admin = await createUser();
    for (const name of ["Zeta", "Alfa"]) {
      await createProcedure({ organizationId: org.id, actorUserId: admin.id, name, steps: [], requiredDocuments: [] });
    }
    const list = await listProcedures(org.id);
    expect(list.map((p) => [p.name, p.currentVersion])).toEqual([
      ["Alfa", 1],
      ["Zeta", 1],
    ]);
  });
});
