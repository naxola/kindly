import { describe, expect, it } from "vitest";
import { buildInvitationEmail } from "@/modules/organizations/invitation-email";
import { buildWelcomeEmail } from "@/modules/contacts/welcome-email";
import { parseOptionalPhoneE164 } from "@/lib/phone";

describe("buildInvitationEmail", () => {
  const input = {
    to: "nuevo@example.com",
    organizationName: "Sindicato <Norte>",
    invitedByName: "Ana",
    role: "DELEGATE" as const,
    url: "https://kindly.test/invite/abc123",
    expiresAt: new Date("2026-11-12T10:00:00Z"),
  };

  it("includes the link, role and expiry in both html and text", () => {
    const email = buildInvitationEmail(input);
    expect(email.to).toBe("nuevo@example.com");
    expect(email.text).toContain("https://kindly.test/invite/abc123");
    expect(email.text).toContain("delegado");
    expect(email.html).toContain('href="https://kindly.test/invite/abc123"');
    expect(email.html).toContain("noviembre");
    expect(email.html.startsWith("<!doctype html>")).toBe(true);
  });

  it("escapes the organization name in html", () => {
    const email = buildInvitationEmail(input);
    expect(email.html).not.toContain("<Norte>");
    expect(email.html).toContain("Sindicato &lt;Norte&gt;");
  });
});

describe("buildWelcomeEmail", () => {
  const base = {
    to: "afiliada@example.com",
    contactName: "Lola",
    organizationName: "Sindicato Norte",
    delegate: { name: "Marta Ruiz", email: "marta@example.com", phoneE164: "+34600111222" as string | null },
  };

  it("shows the delegate's email and phone", () => {
    const email = buildWelcomeEmail(base);
    expect(email.subject).toContain("Sindicato Norte");
    expect(email.text).toContain("marta@example.com");
    expect(email.text).toContain("+34600111222");
    expect(email.html).toContain("mailto:marta@example.com");
    expect(email.html).toContain("tel:+34600111222");
  });

  it("omits the phone row when the delegate has no phone", () => {
    const email = buildWelcomeEmail({ ...base, delegate: { ...base.delegate, phoneE164: null } });
    expect(email.text).not.toContain("Teléfono");
    expect(email.html).not.toContain("tel:");
    expect(email.html).toContain("marta@example.com");
  });

  it("escapes user-controlled names", () => {
    const email = buildWelcomeEmail({ ...base, contactName: '<img src=x onerror="1">' });
    expect(email.html).not.toContain("<img");
  });
});

describe("parseOptionalPhoneE164", () => {
  it("accepts and normalizes international numbers", () => {
    expect(parseOptionalPhoneE164("+34 600-111-222")).toEqual({ ok: true, value: "+34600111222" });
  });
  it("treats empty as no phone", () => {
    expect(parseOptionalPhoneE164("  ")).toEqual({ ok: true, value: null });
    expect(parseOptionalPhoneE164(null)).toEqual({ ok: true, value: null });
  });
  it("rejects numbers without country prefix or with letters", () => {
    expect(parseOptionalPhoneE164("600111222")).toEqual({ ok: false });
    expect(parseOptionalPhoneE164("+34abc")).toEqual({ ok: false });
  });
});
