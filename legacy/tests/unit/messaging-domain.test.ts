import { describe, expect, it } from "vitest";
import { describeAccountStatus } from "@/modules/messaging/domain";
import { messagingAccountStatus } from "@/modules/messaging/schema";

describe("describeAccountStatus (unit, no database)", () => {
  it("covers every status the database can hold", () => {
    for (const status of messagingAccountStatus.enumValues) {
      expect(describeAccountStatus(status)).toBeDefined();
    }
  });

  it("treats DEGRADED as still working but needing attention", () => {
    const degraded = describeAccountStatus("DEGRADED");
    // The trap of this status: messages keep flowing, which is exactly why
    // it gets ignored until it becomes ERROR.
    expect(degraded.operational).toBe(true);
    expect(degraded.needsAttention).toBe(true);
  });

  it("flags ERROR and REVOKED as both broken and needing attention", () => {
    for (const status of ["ERROR", "REVOKED"] as const) {
      expect(describeAccountStatus(status)).toMatchObject({ operational: false, needsAttention: true });
    }
  });

  it("does not ask for attention on a deliberate disconnection or an in-flight connection", () => {
    for (const status of ["DISCONNECTED", "PENDING", "CONNECTING"] as const) {
      expect(describeAccountStatus(status).needsAttention).toBe(false);
    }
  });

  it("is the only status that is both operational and quiet", () => {
    const quietAndWorking = messagingAccountStatus.enumValues.filter((status) => {
      const descriptor = describeAccountStatus(status);
      return descriptor.operational && !descriptor.needsAttention;
    });
    expect(quietAndWorking).toEqual(["CONNECTED"]);
  });
});
