import { describe, expect, it } from "vitest";
import { vercelTrustedOrigins } from "@/modules/auth/trusted-origins";

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
