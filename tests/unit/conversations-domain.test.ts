import { describe, expect, it } from "vitest";
import { getServiceWindowState, isConversationUnread, shouldApplyDeliveryStatus } from "@/modules/conversations/domain";

describe("isConversationUnread (unit, no database)", () => {
  it("is read when there is no message yet", () => {
    expect(isConversationUnread(null, null)).toBe(false);
    expect(isConversationUnread(null, new Date())).toBe(false);
  });

  it("is unread when there is a message but it was never opened", () => {
    expect(isConversationUnread(new Date("2026-01-01T00:00:00Z"), null)).toBe(true);
  });

  it("is unread when the last message arrived after the last read", () => {
    const lastReadAt = new Date("2026-01-01T00:00:00Z");
    const lastMessageCreatedAt = new Date("2026-01-01T00:00:01Z");
    expect(isConversationUnread(lastMessageCreatedAt, lastReadAt)).toBe(true);
  });

  it("is read when the last message arrived before or exactly at the last read", () => {
    const lastReadAt = new Date("2026-01-01T00:00:01Z");
    expect(isConversationUnread(new Date("2026-01-01T00:00:00Z"), lastReadAt)).toBe(false);
    expect(isConversationUnread(lastReadAt, lastReadAt)).toBe(false);
  });
});

describe("getServiceWindowState", () => {
  const now = new Date("2026-09-20T12:00:00Z");

  it("reports NOT_APPLICABLE on a channel without a messaging window", () => {
    expect(getServiceWindowState(new Date("2020-01-01T00:00:00Z"), null, now)).toEqual({
      status: "NOT_APPLICABLE",
      expiresAt: null,
    });
  });

  it("is CLOSED when the Contact has never written", () => {
    expect(getServiceWindowState(null, 24, now)).toEqual({ status: "CLOSED", expiresAt: null });
  });

  it("is OPEN within the window and reports when it expires", () => {
    const lastInbound = new Date("2026-09-20T02:00:00Z");
    const state = getServiceWindowState(lastInbound, 24, now);
    expect(state.status).toBe("OPEN");
    expect(state.expiresAt).toEqual(new Date("2026-09-21T02:00:00Z"));
  });

  it("is CLOSED once the window has elapsed", () => {
    expect(getServiceWindowState(new Date("2026-09-19T11:00:00Z"), 24, now).status).toBe("CLOSED");
  });

  it("closes exactly at the boundary, never a millisecond later", () => {
    const lastInbound = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(getServiceWindowState(lastInbound, 24, now).status).toBe("CLOSED");
    expect(getServiceWindowState(new Date(lastInbound.getTime() + 1), 24, now).status).toBe("OPEN");
  });
});

describe("shouldApplyDeliveryStatus (PKG-013)", () => {
  it("only moves forward along sent → delivered → read", () => {
    expect(shouldApplyDeliveryStatus("SENT", "DELIVERED")).toBe(true);
    expect(shouldApplyDeliveryStatus("DELIVERED", "READ")).toBe(true);
    expect(shouldApplyDeliveryStatus("SENT", "READ")).toBe(true);
    // Meta's callbacks arrive out of order: a late "delivered" never undoes "read".
    expect(shouldApplyDeliveryStatus("READ", "DELIVERED")).toBe(false);
    expect(shouldApplyDeliveryStatus("DELIVERED", "SENT")).toBe(false);
    expect(shouldApplyDeliveryStatus("READ", "READ")).toBe(false);
  });

  it("lets FAILED replace only a message that never reached the phone, and lets the phone overrule it", () => {
    expect(shouldApplyDeliveryStatus("SENT", "FAILED")).toBe(true);
    expect(shouldApplyDeliveryStatus("PENDING", "FAILED")).toBe(true);
    expect(shouldApplyDeliveryStatus("DELIVERED", "FAILED")).toBe(false);
    expect(shouldApplyDeliveryStatus("FAILED", "DELIVERED")).toBe(true);
    expect(shouldApplyDeliveryStatus("FAILED", "SENT")).toBe(false);
  });
});
