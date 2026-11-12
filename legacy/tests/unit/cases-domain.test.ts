import { describe, expect, it } from "vitest";
import { CASE_STATUS_TRANSITIONS, isValidCaseStatusTransition } from "@/modules/cases/domain";
import { caseStatus, type CaseStatus } from "@/modules/cases/schema";

describe("isValidCaseStatusTransition (unit, no database)", () => {
  it("always allows keeping the current status", () => {
    for (const status of caseStatus.enumValues) {
      expect(isValidCaseStatusTransition(status, status)).toBe(true);
    }
  });

  it.each([
    ["OPEN", "IN_PROGRESS"],
    ["IN_PROGRESS", "WAITING"],
    ["IN_PROGRESS", "RESOLVED"],
    ["WAITING", "IN_PROGRESS"],
    ["WAITING", "RESOLVED"],
    ["RESOLVED", "IN_PROGRESS"],
    ["RESOLVED", "CLOSED"],
  ] as [CaseStatus, CaseStatus][])("allows %s -> %s", (from, to) => {
    expect(isValidCaseStatusTransition(from, to)).toBe(true);
  });

  it.each([
    ["OPEN", "WAITING"],
    ["OPEN", "RESOLVED"],
    ["OPEN", "CLOSED"],
    ["IN_PROGRESS", "OPEN"],
    ["IN_PROGRESS", "CLOSED"],
    ["WAITING", "OPEN"],
    ["WAITING", "CLOSED"],
    ["RESOLVED", "OPEN"],
    ["RESOLVED", "WAITING"],
    ["CLOSED", "OPEN"],
    ["CLOSED", "IN_PROGRESS"],
    ["CLOSED", "WAITING"],
    ["CLOSED", "RESOLVED"],
  ] as [CaseStatus, CaseStatus][])("rejects %s -> %s", (from, to) => {
    expect(isValidCaseStatusTransition(from, to)).toBe(false);
  });

  it("CLOSED is terminal — no outgoing transitions at all", () => {
    expect(CASE_STATUS_TRANSITIONS.CLOSED).toEqual([]);
  });
});
