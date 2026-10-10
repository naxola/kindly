import { describe, expect, it } from "vitest";
import { isSchemaBehindError } from "@/modules/knowledge/schema-behind";

describe("isSchemaBehindError", () => {
  it("recognizes a missing table or column, also wrapped as the cause of another error", () => {
    expect(isSchemaBehindError({ code: "42P01" })).toBe(true);
    expect(isSchemaBehindError({ code: "42703" })).toBe(true);
    expect(isSchemaBehindError(new Error("Failed query", { cause: { code: "42P01" } }))).toBe(true);
    expect(isSchemaBehindError(new Error("a", { cause: new Error("b", { cause: { code: "42703" } }) }))).toBe(true);
  });

  it("is false for any other error", () => {
    expect(isSchemaBehindError({ code: "23505" })).toBe(false);
    expect(isSchemaBehindError(new Error("boom"))).toBe(false);
    expect(isSchemaBehindError("42P01")).toBe(false);
    expect(isSchemaBehindError(null)).toBe(false);
    expect(isSchemaBehindError(undefined)).toBe(false);
  });

  it("does not loop on a cyclic cause", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(isSchemaBehindError(error)).toBe(false);
  });
});
