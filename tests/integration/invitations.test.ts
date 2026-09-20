import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationInvitations, organizationMembers, organizations } from "@/modules/organizations/schema";
import {
  acceptPendingInvitationForUser,
  createInvitation,
  getInvitationByToken,
  revokeInvitation,
} from "@/modules/organizations/invitations";
import { ensureOrganizationForUser } from "@/modules/organizations/bootstrap";
import { listActivitiesForEntity } from "@/modules/audit/service";

/**
 * PKG-006 — invitations. Before this package every signup created its own
 * Organization with the user as ADMIN, so a DELEGATE could not exist and
 * "el administrador o el delegado" was untestable.
 *
 * The constraint that shapes all of it: `organization_members_user_unique`
 * means a user belongs to exactly one Organization, so an invitation is
 * only ever usable by an address that has no account yet.
 */

const baseUrl = "http://localhost:3000";

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 5 });
  db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
});

afterAll(async () => {
  await client.end();
});

async function createAdminAndOrg(name: string) {
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` })
    .returning();
  const [org] = await db.insert(organizations).values({ name: `${name}'s org` }).returning();
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "ADMIN" });
  return { user, org };
}

async function membershipOf(userId: string) {
  const [row] = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  return row ?? null;
}

describe("PKG-006 invitations (integration, real PostgreSQL)", () => {
  it("an invited address joins the inviting organization with the invited role", async () => {
    const { user: admin, org } = await createAdminAndOrg("Inviting Admin");
    const email = `${randomUUID()}@example.com`;

    await createInvitation({
      organizationId: org.id,
      invitedByUserId: admin.id,
      email,
      role: "DELEGATE",
    });

    const [invitee] = await db
      .insert(users)
      .values({ id: randomUUID(), name: "Invited Person", email })
      .returning();

    await ensureOrganizationForUser(invitee.id, invitee.name, invitee.email);

    const membership = await membershipOf(invitee.id);
    expect(membership?.organizationId).toBe(org.id);
    expect(membership?.role).toBe("DELEGATE");

    // And no organization of their own was created on the side.
    const allOrgsForInvitee = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, invitee.id));
    expect(allOrgsForInvitee).toHaveLength(1);

    const activities = await listActivitiesForEntity(org.id, "organization", org.id);
    expect(activities.map((a) => a.type)).toContain("MEMBER_JOINED");
  });

  it("matches the invitation case-insensitively", async () => {
    const { user: admin, org } = await createAdminAndOrg("Case Admin");
    const email = `${randomUUID()}@example.com`;

    await createInvitation({
      organizationId: org.id,
      invitedByUserId: admin.id,
      email: email.toUpperCase(),
      role: "DELEGATE",
    });

    const [invitee] = await db
      .insert(users)
      .values({ id: randomUUID(), name: "Mixed Case", email })
      .returning();
    await ensureOrganizationForUser(invitee.id, invitee.name, invitee.email);

    expect((await membershipOf(invitee.id))?.organizationId).toBe(org.id);
  });

  it("gives a user with no invitation their own organization as ADMIN", async () => {
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), name: "Solo User", email: `${randomUUID()}@example.com` })
      .returning();

    await ensureOrganizationForUser(user.id, user.name, user.email);

    const membership = await membershipOf(user.id);
    expect(membership?.role).toBe("ADMIN");
  });

  it("ignores an expired invitation and falls back to a brand-new organization", async () => {
    const { user: admin, org } = await createAdminAndOrg("Expired Admin");
    const email = `${randomUUID()}@example.com`;

    await createInvitation({
      organizationId: org.id,
      invitedByUserId: admin.id,
      email,
      role: "DELEGATE",
      ttlDays: -1,
    });

    const [invitee] = await db.insert(users).values({ id: randomUUID(), name: "Late", email }).returning();
    await ensureOrganizationForUser(invitee.id, invitee.name, invitee.email);

    const membership = await membershipOf(invitee.id);
    expect(membership?.organizationId).not.toBe(org.id);
    expect(membership?.role).toBe("ADMIN");
  });

  it("refuses a second pending invitation for the same email in the same organization", async () => {
    const { user: admin, org } = await createAdminAndOrg("Double Invite Admin");
    const email = `${randomUUID()}@example.com`;
    const invite = () =>
      createInvitation({ organizationId: org.id, invitedByUserId: admin.id, email, role: "DELEGATE" });

    await invite();
    await expect(invite()).rejects.toThrow(/already a pending invitation/);
  });

  it("allows inviting the same email again once the previous invitation is revoked", async () => {
    const { user: admin, org } = await createAdminAndOrg("Revoke Then Invite Admin");
    const email = `${randomUUID()}@example.com`;

    const first = await createInvitation({
      organizationId: org.id,
      invitedByUserId: admin.id,
      email,
      role: "DELEGATE",
    });
    await revokeInvitation(org.id, first.id);

    const second = await createInvitation({
      organizationId: org.id,
      invitedByUserId: admin.id,
      email,
      role: "ADMIN",
    });
    expect(second.id).not.toBe(first.id);
  });

  it("does not revoke an invitation belonging to another organization", async () => {
    const { user: admin, org } = await createAdminAndOrg("Owner Admin");
    const { org: otherOrg } = await createAdminAndOrg("Other Admin");

    const invitation = await createInvitation({
      organizationId: org.id,
      invitedByUserId: admin.id,
      email: `${randomUUID()}@example.com`,
      role: "DELEGATE",
    });

    expect(await revokeInvitation(otherOrg.id, invitation.id)).toBeNull();

    const [unchanged] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.id, invitation.id));
    expect(unchanged.status).toBe("PENDING");
  });

  it("leaves the invitation pending when the invitee already belongs to an organization", async () => {
    const { user: admin, org } = await createAdminAndOrg("Late Invite Admin");
    const { user: existing } = await createAdminAndOrg("Already Has An Org");

    const invitation = await createInvitation({
      organizationId: org.id,
      invitedByUserId: admin.id,
      email: existing.email,
      role: "DELEGATE",
    });

    expect(await acceptPendingInvitationForUser(existing.id, existing.email)).toBeNull();

    const [row] = await db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.id, invitation.id));
    // Never marked ACCEPTED against a membership that was not created.
    expect(row.status).toBe("PENDING");
    expect((await membershipOf(existing.id))?.organizationId).not.toBe(org.id);
  });

  describe("the public invitation page's view of a token", () => {
    it("reports USABLE for a fresh invitation and null for an unknown token", async () => {
      const { user: admin, org } = await createAdminAndOrg("Token Admin");
      const invitation = await createInvitation({
        organizationId: org.id,
        invitedByUserId: admin.id,
        email: `${randomUUID()}@example.com`,
        role: "DELEGATE",
      });

      const view = await getInvitationByToken(invitation.token);
      expect(view?.usability).toBe("USABLE");
      expect(view?.organizationName).toBe(`Token Admin's org`);
      expect(await getInvitationByToken("not-a-real-token")).toBeNull();
    });

    it("distinguishes expired, revoked and already-registered from each other", async () => {
      const { user: admin, org } = await createAdminAndOrg("States Admin");

      const expired = await createInvitation({
        organizationId: org.id,
        invitedByUserId: admin.id,
        email: `${randomUUID()}@example.com`,
        role: "DELEGATE",
        ttlDays: -1,
      });
      expect((await getInvitationByToken(expired.token))?.usability).toBe("EXPIRED");

      const revoked = await createInvitation({
        organizationId: org.id,
        invitedByUserId: admin.id,
        email: `${randomUUID()}@example.com`,
        role: "DELEGATE",
      });
      await revokeInvitation(org.id, revoked.id);
      expect((await getInvitationByToken(revoked.token))?.usability).toBe("REVOKED");

      const { user: taken } = await createAdminAndOrg("Taken Email");
      const alreadyRegistered = await createInvitation({
        organizationId: org.id,
        invitedByUserId: admin.id,
        email: taken.email,
        role: "DELEGATE",
      });
      expect((await getInvitationByToken(alreadyRegistered.token))?.usability).toBe("EMAIL_ALREADY_REGISTERED");
    });
  });

  it("joins the inviting organization through the real Better Auth signup", async () => {
    const { auth } = await import("@/modules/auth/auth");
    const { user: admin, org } = await createAdminAndOrg("Real Signup Admin");
    const email = `${randomUUID()}@example.com`;

    await createInvitation({
      organizationId: org.id,
      invitedByUserId: admin.id,
      email,
      role: "DELEGATE",
    });

    const response = await auth.handler(
      new Request(`${baseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Invited Via Signup", email, password: "correcthorsebattery" }),
      }),
    );
    expect(response.status).toBe(200);

    const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.userId, created.id), eq(organizationMembers.organizationId, org.id)),
      )
      .limit(1);

    expect(membership).toBeTruthy();
    expect(membership.role).toBe("DELEGATE");
  });
});
