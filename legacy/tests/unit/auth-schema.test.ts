import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { accounts, sessions, users, verifications } from "@/modules/auth/schema";

describe("auth schema (unit, no database)", () => {
  it("uses plural table names matching docs/DATABASE.md", () => {
    expect(getTableName(users)).toBe("users");
    expect(getTableName(sessions)).toBe("sessions");
    expect(getTableName(accounts)).toBe("accounts");
    expect(getTableName(verifications)).toBe("verifications");
  });

  it("users has the fields Better Auth's core user schema requires", () => {
    // Verified against the installed better-auth package's own source
    // (@better-auth/core/src/db/schema/user.ts + shared.ts), not memory.
    const columns = Object.keys(getTableColumns(users));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "email",
        "emailVerified",
        "image",
        "createdAt",
        "updatedAt",
      ]),
    );
  });

  it("accounts stores the credential password separately from OAuth tokens", () => {
    const columns = Object.keys(getTableColumns(accounts));
    expect(columns).toEqual(
      expect.arrayContaining(["providerId", "accountId", "userId", "password"]),
    );
  });
});
