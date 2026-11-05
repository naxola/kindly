import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { createContact } from "@/modules/contacts/service";
import { assignContactToDelegate, getActiveAssignment } from "@/modules/contacts/assignments";
import { sendContactWelcomeEmail } from "@/modules/contacts/welcome";
import { updateMemberPhone, listOrganizationMembers } from "@/modules/organizations/service";
import { setEmailSenderForTesting, type EmailMessage } from "@/modules/email/sender";
import { listActivitiesForEntity } from "@/modules/audit/service";

/**
 * Delegate onboarding: member phone, picking the initial delegate, and the
 * welcome email that introduces the delegate (email + phone) to the
 * affiliate — against real PostgreSQL, with a fake `EmailSender`.
 */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const sent: EmailMessage[] = [];

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations") });
});

afterEach(() => {
  sent.length = 0;
  setEmailSenderForTesting(undefined);
});

afterAll(async () => {
  await client.end();
});

function captureEmails(failWith?: string) {
  setEmailSenderForTesting({
    async send(message) {
      if (failWith) {
        throw new Error(failWith);
      }
      sent.push(message);
    },
  });
}

async function setup(roles: Array<"ADMIN" | "DELEGATE"> = ["ADMIN", "DELEGATE"]) {
  const [org] = await db.insert(organizations).values({ name: "Sindicato Test" }).returning();
  const members = [];
  for (const [index, role] of roles.entries()) {
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), name: `Miembro ${index}`, email: `${randomUUID()}@example.com` })
      .returning();
    await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role });
    members.push(user);
  }
  return { org, members };
}

describe("member phone", () => {
  it("stores and clears the phone, scoped to the organization", async () => {
    const { org, members } = await setup();
    const other = await setup();

    await updateMemberPhone(org.id, members[1].id, "+34600111222");
    const listed = await listOrganizationMembers(org.id);
    expect(listed.find((m) => m.userId === members[1].id)?.phoneE164).toBe("+34600111222");

    // A userId from another organization matches nothing.
    expect(await updateMemberPhone(org.id, other.members[0].id, "+34999999999")).toBeNull();

    await updateMemberPhone(org.id, members[1].id, null);
    const cleared = await listOrganizationMembers(org.id);
    expect(cleared.find((m) => m.userId === members[1].id)?.phoneE164).toBeNull();
  });
});

describe("createContact with a chosen delegate", () => {
  it("assigns the chosen member and records who chose", async () => {
    const { org, members } = await setup();
    const [admin, delegate] = members;
    const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Lola", delegateId: delegate.id });
    const active = await getActiveAssignment(org.id, contact.id);
    expect(active?.delegateId).toBe(delegate.id);
    expect(active?.assignedBy).toBe(admin.id);
  });

  it("rejects a delegate outside the organization", async () => {
    const { org, members } = await setup();
    const outsider = (await setup()).members[0];
    await expect(
      createContact({ organizationId: org.id, actorUserId: members[0].id, name: "Lola", delegateId: outsider.id }),
    ).rejects.toThrow("outside the organization");
  });
});

describe("sendContactWelcomeEmail", () => {
  it("sends the delegate's email and phone, stamps the assignment and logs it", async () => {
    captureEmails();
    const { org, members } = await setup();
    const [admin, delegate] = members;
    await updateMemberPhone(org.id, delegate.id, "+34600111222");
    const contact = await createContact({
      organizationId: org.id,
      actorUserId: admin.id,
      name: "Lola",
      email: "lola@example.com",
      delegateId: delegate.id,
    });

    const result = await sendContactWelcomeEmail({ organizationId: org.id, actorUserId: admin.id, contactId: contact.id });

    expect(result).toEqual({ status: "SENT" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("lola@example.com");
    expect(sent[0].html).toContain(delegate.email);
    expect(sent[0].html).toContain("+34600111222");
    expect((await getActiveAssignment(org.id, contact.id))?.welcomeSentAt).toBeInstanceOf(Date);
    const activities = await listActivitiesForEntity(org.id, "contact", contact.id);
    expect(activities.some((a) => a.type === "CONTACT_WELCOME_SENT")).toBe(true);
  });

  it("does not send twice unless forced", async () => {
    captureEmails();
    const { org, members } = await setup();
    const contact = await createContact({ organizationId: org.id, actorUserId: members[0].id, name: "Lola", email: "lola@example.com" });
    const args = { organizationId: org.id, actorUserId: members[0].id, contactId: contact.id };

    expect((await sendContactWelcomeEmail(args)).status).toBe("SENT");
    expect(await sendContactWelcomeEmail(args)).toEqual({ status: "SKIPPED", reason: "ALREADY_SENT" });
    expect((await sendContactWelcomeEmail({ ...args, force: true })).status).toBe("SENT");
    expect(sent).toHaveLength(2);
  });

  it("skips a contact without email", async () => {
    captureEmails();
    const { org, members } = await setup();
    const contact = await createContact({ organizationId: org.id, actorUserId: members[0].id, name: "Sin email" });
    const result = await sendContactWelcomeEmail({ organizationId: org.id, actorUserId: members[0].id, contactId: contact.id });
    expect(result).toEqual({ status: "SKIPPED", reason: "NO_EMAIL" });
    expect(sent).toHaveLength(0);
  });

  it("a new delegate gets a new introduction", async () => {
    captureEmails();
    const { org, members } = await setup();
    const [admin, delegate] = members;
    const contact = await createContact({ organizationId: org.id, actorUserId: admin.id, name: "Lola", email: "lola@example.com" });
    const args = { organizationId: org.id, actorUserId: admin.id, contactId: contact.id };

    await sendContactWelcomeEmail(args);
    await assignContactToDelegate(org.id, admin.id, contact.id, delegate.id);
    expect((await sendContactWelcomeEmail(args)).status).toBe("SENT");
    expect(sent[1].html).toContain(delegate.email);
  });

  it("propagates a provider failure and leaves the stamp unset so it can be retried", async () => {
    captureEmails("Domain not verified");
    const { org, members } = await setup();
    const contact = await createContact({ organizationId: org.id, actorUserId: members[0].id, name: "Lola", email: "lola@example.com" });

    await expect(
      sendContactWelcomeEmail({ organizationId: org.id, actorUserId: members[0].id, contactId: contact.id }),
    ).rejects.toThrow("Domain not verified");
    expect((await getActiveAssignment(org.id, contact.id))?.welcomeSentAt).toBeNull();
  });

  it("never reaches a contact from another organization", async () => {
    captureEmails();
    const a = await setup();
    const b = await setup();
    const contact = await createContact({ organizationId: a.org.id, actorUserId: a.members[0].id, name: "Lola", email: "lola@example.com" });
    const result = await sendContactWelcomeEmail({ organizationId: b.org.id, actorUserId: b.members[0].id, contactId: contact.id });
    expect(result).toEqual({ status: "SKIPPED", reason: "CONTACT_NOT_FOUND" });
    expect(sent).toHaveLength(0);
  });
});
