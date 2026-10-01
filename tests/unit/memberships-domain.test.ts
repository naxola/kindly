import { describe, expect, it } from "vitest";
import { firstUnpaidMonth, isFeeOverdue } from "@/modules/memberships/domain";

describe("isFeeOverdue (unit, no database)", () => {
  it("is never overdue while INACTIVE, regardless of feePaidUntil", () => {
    expect(isFeeOverdue({ status: "INACTIVE", feePaidUntil: "2020-01-01" }, new Date("2026-09-29"))).toBe(false);
  });

  it("is never overdue with no fee ever recorded", () => {
    expect(isFeeOverdue({ status: "ACTIVE", feePaidUntil: null }, new Date("2026-09-29"))).toBe(false);
  });

  it("is overdue when paid through a month before the current one", () => {
    expect(isFeeOverdue({ status: "ACTIVE", feePaidUntil: "2026-08-01" }, new Date("2026-09-29"))).toBe(true);
  });

  it("is not overdue when paid through the current month", () => {
    expect(isFeeOverdue({ status: "ACTIVE", feePaidUntil: "2026-09-01" }, new Date("2026-09-29"))).toBe(false);
  });

  it("is not overdue when paid ahead", () => {
    expect(isFeeOverdue({ status: "ACTIVE", feePaidUntil: "2026-12-01" }, new Date("2026-09-29"))).toBe(false);
  });
});

describe("firstUnpaidMonth (unit, no database)", () => {
  it("is the month right after feePaidUntil", () => {
    expect(firstUnpaidMonth("2026-08-01").toISOString().slice(0, 7)).toBe("2026-09");
  });

  it("rolls over the year boundary", () => {
    expect(firstUnpaidMonth("2026-12-01").toISOString().slice(0, 7)).toBe("2027-01");
  });
});
