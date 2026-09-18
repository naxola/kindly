import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { cases, caseStatus } from "@/modules/cases/schema";

describe("cases schema (unit, no database)", () => {
  it("only allows the five documented statuses", () => {
    // docs/PRODUCT.md sección 7 / docs/DATABASE.md sección 9.
    expect(caseStatus.enumValues).toEqual(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]);
  });

  it("has the columns documented for Case, with priority as free text", () => {
    const columns = Object.keys(getTableColumns(cases));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "organizationId",
        "contactId",
        "title",
        "description",
        "status",
        "priority",
        "assignedTo",
        "closedAt",
      ]),
    );
  });
});
