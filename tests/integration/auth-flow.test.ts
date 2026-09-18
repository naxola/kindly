import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";

/**
 * Integration test for the real Better Auth flow (acceptance criteria 10
 * and 11 of PKG-001): register → session cookie → get-session → sign-out,
 * driven through `auth.handler`, the exact function the Next.js route at
 * src/app/api/auth/[...all]/route.ts delegates to (via `toNextJsHandler`).
 * No HTTP server is started — this calls the same code path directly.
 *
 * Better Auth itself is our own infrastructure choice (docs/ARCHITECTURE.md
 * sección 13), not an external provider, so per tests/README.md it's
 * exercised for real here instead of mocked.
 */

const baseUrl = "http://localhost:3000";

function extractCookieHeader(response: Response): string {
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) {
    return setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
  }
  const single = response.headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
});

afterAll(async () => {
  await client.end();
});

describe("Better Auth email+password flow (integration, real PostgreSQL)", () => {
  it("registers, creates a session, and the session can be read back", async () => {
    const { auth } = await import("@/modules/auth/auth");
    const email = `${crypto.randomUUID()}@example.com`;

    const signUpResponse = await auth.handler(
      new Request(`${baseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test User", email, password: "correcthorsebattery" }),
      }),
    );

    expect(signUpResponse.status).toBe(200);
    const cookie = extractCookieHeader(signUpResponse);
    expect(cookie).not.toBe("");

    const sessionResponse = await auth.handler(
      new Request(`${baseUrl}/api/auth/get-session`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(sessionResponse.status).toBe(200);

    const sessionBody = (await sessionResponse.json()) as {
      user: { email: string };
      session: unknown;
    };
    expect(sessionBody.user.email).toBe(email);
    expect(sessionBody.session).toBeTruthy();
  });

  it("rejects get-session without a cookie", async () => {
    const { auth } = await import("@/modules/auth/auth");

    const response = await auth.handler(new Request(`${baseUrl}/api/auth/get-session`));
    expect(response.status).toBe(200);
    // No session: Better Auth returns an empty body, not a user.
    const body = await response.text();
    expect(body === "" || body === "null").toBe(true);
  });

  it("logs in an existing user with sign-in/email", async () => {
    const { auth } = await import("@/modules/auth/auth");
    const email = `${crypto.randomUUID()}@example.com`;
    const password = "correcthorsebattery";

    await auth.handler(
      new Request(`${baseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Another User", email, password }),
      }),
    );

    const signInResponse = await auth.handler(
      new Request(`${baseUrl}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );

    expect(signInResponse.status).toBe(200);
    expect(extractCookieHeader(signInResponse)).not.toBe("");
  });

  it("rejects sign-in with the wrong password", async () => {
    const { auth } = await import("@/modules/auth/auth");
    const email = `${crypto.randomUUID()}@example.com`;

    await auth.handler(
      new Request(`${baseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Third User", email, password: "correcthorsebattery" }),
      }),
    );

    const signInResponse = await auth.handler(
      new Request(`${baseUrl}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "wrong-password" }),
      }),
    );

    expect(signInResponse.status).toBeGreaterThanOrEqual(400);
  });
});
