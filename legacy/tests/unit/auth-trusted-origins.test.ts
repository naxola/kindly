import { describe, expect, it } from "vitest";
import { authBaseOrigin, vercelTrustedOrigins } from "@/modules/auth/trusted-origins";

describe("vercelTrustedOrigins", () => {
  it("trusts exactly the hosts Vercel assigns to this deploy, over https", () => {
    expect(
      vercelTrustedOrigins({
        VERCEL_URL: "kindly-abc123-naxolas-projects.vercel.app",
        VERCEL_BRANCH_URL: "kindly-git-staging-naxolas-projects.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "kindly-peach.vercel.app",
      }),
    ).toEqual([
      "https://kindly-abc123-naxolas-projects.vercel.app",
      "https://kindly-git-staging-naxolas-projects.vercel.app",
      "https://kindly-peach.vercel.app",
    ]);
  });

  it("is empty outside Vercel and never falls back to a wildcard", () => {
    expect(vercelTrustedOrigins({})).toEqual([]);
  });

  it("deduplicates when production and deployment hosts coincide", () => {
    expect(vercelTrustedOrigins({ VERCEL_URL: "a.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "a.vercel.app" })).toEqual([
      "https://a.vercel.app",
    ]);
  });
});

describe("authBaseOrigin", () => {
  it("drops any path, query or trailing slash pasted along with the host", () => {
    expect(authBaseOrigin("https://kindly-git-staging-naxolas-projects.vercel.app/login")).toBe(
      "https://kindly-git-staging-naxolas-projects.vercel.app",
    );
    expect(authBaseOrigin("https://kindly-peach.vercel.app/")).toBe("https://kindly-peach.vercel.app");
    expect(authBaseOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("leaves an unset value unset and rejects garbage loudly", () => {
    expect(authBaseOrigin("")).toBeUndefined();
    expect(() => authBaseOrigin("kindly-peach.vercel.app")).toThrow("BETTER_AUTH_URL is not a valid URL");
  });
});
