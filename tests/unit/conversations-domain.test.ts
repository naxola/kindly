import { describe, expect, it } from "vitest";
import { isConversationUnread } from "@/modules/conversations/domain";

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
