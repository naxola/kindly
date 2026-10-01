import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/cron/reindex-knowledge/route";

const call = (authorization?: string) =>
  POST(
    new Request("https://example.test/api/cron/reindex-knowledge", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    }),
  );

describe("cron reindex-knowledge auth", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 401 when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer anything")).status).toBe(401);
  });

  it("returns 401 without an Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
  });

  it("returns 401 on a wrong token and never logs the secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await call("Bearer wrong");
    expect(res.status).toBe(401);
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).not.toContain("s3cret");
    expect(logged).not.toContain("wrong");
  });

  it("accepts the right token, tolerating whitespace/quotes in the env value", async () => {
    vi.stubEnv("CRON_SECRET", ' "s3cret"\n');
    // Passes auth; with no embedding provider registered it stops at 503.
    expect((await call("Bearer s3cret")).status).toBe(503);
  });
});
