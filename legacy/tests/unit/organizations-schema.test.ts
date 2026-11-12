import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  organizationMembers,
  organizationRole,
  organizations,
} from "@/modules/organizations/schema";

describe("organizations schema (unit, no database)", () => {
  it("only allows ADMIN or DELEGATE as organization role", () => {
    // This is what makes acceptance criterion 7 of PKG-001 possible: the
    // enum is defined once and used both by Postgres (CREATE TYPE) and by
    // Drizzle's TypeScript types.
    expect(organizationRole.enumValues).toEqual(["ADMIN", "DELEGATE"]);
  });

  it("organizations has the columns documented in docs/DATABASE.md", () => {
    const columns = Object.keys(getTableColumns(organizations));
    expect(columns).toEqual(
      expect.arrayContaining(["id", "name", "createdAt", "updatedAt"]),
    );
  });

  it("organization_members links an organization to a user with a role", () => {
    const columns = Object.keys(getTableColumns(organizationMembers));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "organizationId",
        "userId",
        "role",
        "createdAt",
        "updatedAt",
      ]),
    );
  });
});
