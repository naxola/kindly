import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendEmailSender } from "@/modules/email/resend";
import { getEmailSender, sendEmail } from "@/modules/email/sender";
import { buildPasswordResetEmail } from "@/modules/auth/password-reset-email";

/** Unit tests for PKG-012's email layer — `fetch` injected, never a real call. */

const message = { to: "ana@example.com", subject: "Asunto", text: "Texto", html: "<p>Texto</p>" };

describe("ResendEmailSender", () => {
  it("posts the message to Resend with the API key as a Bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    await new ResendEmailSender({ apiKey: "re_key", from: "Kindly <a@b.com>", fetchImpl }).send(message);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body)).toEqual({ from: "Kindly <a@b.com>", to: ["ana@example.com"], subject: "Asunto", text: "Texto", html: "<p>Texto</p>" });
  });

  it("throws Resend's reason without leaking the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 }));
    const sending = new ResendEmailSender({ apiKey: "re_key", from: "x", fetchImpl }).send(message);
    await expect(sending).rejects.toThrow("Domain not verified");
    await expect(sending).rejects.not.toThrow("re_key");
  });
});

describe("getEmailSender", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses Resend when RESEND_API_KEY is set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_key");
    expect(getEmailSender()).toBeInstanceOf(ResendEmailSender);
  });

  it("refuses to fake it in production without a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(getEmailSender()).toBeNull();
    await expect(sendEmail(message)).rejects.toThrow("Email is not configured");
  });

  it("prints to the console in development without a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail(message);
    expect(info.mock.calls[0][0]).toContain("ana@example.com");
    info.mockRestore();
  });
});

describe("buildPasswordResetEmail", () => {
  it("includes the link and the expiry in both text and HTML, escaping the HTML", () => {
    const email = buildPasswordResetEmail({ to: "ana@example.com", name: "Ana <b>", url: "https://k.app/api/auth/reset-password/t?callbackURL=%2Freset-password&x=1" });
    expect(email.to).toBe("ana@example.com");
    expect(email.text).toContain("https://k.app/api/auth/reset-password/t?callbackURL=%2Freset-password&x=1");
    expect(email.text).toContain("60 minutos");
    expect(email.html).toContain("&amp;x=1");
    expect(email.html).toContain("Ana &lt;b&gt;");
    expect(email.html).not.toContain("<b>");
  });
});
