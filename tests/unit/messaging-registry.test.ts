import { afterEach, describe, expect, it } from "vitest";
import { clearMessagingAdapters, getMessagingAdapter, registerMessagingAdapter } from "@/modules/messaging/registry";
import { FakeMessagingAdapter } from "../fakes/messaging-adapter";

describe("messaging adapter registry (unit, no database)", () => {
  afterEach(() => {
    clearMessagingAdapters();
  });

  it("returns null for a channel with no registered adapter", () => {
    expect(getMessagingAdapter("fake")).toBeNull();
  });

  it("returns the adapter registered for its own channel", () => {
    const adapter = new FakeMessagingAdapter();
    registerMessagingAdapter(adapter);
    expect(getMessagingAdapter("fake")).toBe(adapter);
  });

  it("clearMessagingAdapters removes every registration", () => {
    registerMessagingAdapter(new FakeMessagingAdapter());
    clearMessagingAdapters();
    expect(getMessagingAdapter("fake")).toBeNull();
  });
});
