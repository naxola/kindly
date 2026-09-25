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

/**
 * PKG-012: password reset by email, end to end through `auth.handler`, with
 * the `EmailSender` replaced by one that captures the message — the only
 * thing faked is the email provider.
 */
describe("Password reset by email (integration, real PostgreSQL)", () => {
  it("emails a link whose token sets a new password, revokes sessions, and can't be reused", async () => {
    const { auth } = await import("@/modules/auth/auth");
    const { setEmailSenderForTesting } = await import("@/modules/email/sender");
    const sent: Array<{ to: string; text: string }> = [];
    setEmailSenderForTesting({ send: async (message) => void sent.push(message) });

    try {
      const email = `${crypto.randomUUID()}@example.com`;
      // Its own client IP, so the earlier tests' sign-ups don't count
      // against Better Auth's per-IP rate limit (3 per 10 s on sign-in/up).
      const ip = `10.12.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
      const post = (path: string, body: unknown, cookie?: string) =>
        auth.handler(
          new Request(`${baseUrl}/api/auth${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
            body: JSON.stringify(body),
          }),
        );

      const signUp = await post("/sign-up/email", { name: "Olvidadiza", email, password: "old-password-1" });
      const oldCookie = extractCookieHeader(signUp);

      expect((await post("/request-password-reset", { email, redirectTo: "/reset-password" })).status).toBe(200);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(email);
      const link = sent[0].text.match(/https?:\/\/\S+/)?.[0];
      expect(link).toBeDefined();

      // The emailed link goes through Better Auth's token check, which
      // redirects to our page with the token in the query string.
      const callback = await auth.handler(new Request(link!, { headers: { "x-forwarded-for": ip } }));
      const landing = new URL(callback.headers.get("location")!, baseUrl);
      expect(landing.pathname).toBe("/reset-password");
      const token = landing.searchParams.get("token")!;

      expect((await post("/reset-password", { token, newPassword: "new-password-2" })).status).toBe(200);

      expect((await post("/sign-in/email", { email, password: "old-password-1" })).status).toBe(401);
      expect((await post("/sign-in/email", { email, password: "new-password-2" })).status).toBe(200);

      const oldSession = await auth.handler(
        new Request(`${baseUrl}/api/auth/get-session`, { headers: { cookie: oldCookie } }),
      );
      expect(await oldSession.json()).toBeNull();

      expect((await post("/reset-password", { token, newPassword: "third-password-3" })).status).toBe(400);
    } finally {
      setEmailSenderForTesting(undefined);
    }
  });

  it("answers an unknown email exactly like a known one and sends nothing", async () => {
    const { auth } = await import("@/modules/auth/auth");
    const { setEmailSenderForTesting } = await import("@/modules/email/sender");
    const sent: unknown[] = [];
    setEmailSenderForTesting({ send: async (message) => void sent.push(message) });

    try {
      const response = await auth.handler(
        new Request(`${baseUrl}/api/auth/request-password-reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "10.13.0.1" },
          body: JSON.stringify({ email: `${crypto.randomUUID()}@example.com`, redirectTo: "/reset-password" }),
        }),
      );
      expect(response.status).toBe(200);
      expect(sent).toHaveLength(0);
    } finally {
      setEmailSenderForTesting(undefined);
    }
  });
});

