import type { EmailMessage, EmailSender } from "@/modules/email/sender";

export interface ResendEmailSenderConfig {
  apiKey: string;
  /** `Name <address@verified-domain>`; until a domain is verified, only `onboarding@resend.dev` works. */
  from: string;
  /** Injectable for unit tests — never a real network call in CI (`CLAUDE.md` sección 6). */
  fetchImpl?: typeof fetch;
}

/** Resend's REST API (`POST /emails`), without the SDK: one call doesn't justify a dependency. */
export class ResendEmailSender implements EmailSender {
  private readonly config: ResendEmailSenderConfig;

  constructor(config: ResendEmailSenderConfig) {
    this.config = config;
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await (this.config.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      // Resend's message only — never the request, it carries the API key.
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(`Resend ${response.status}: ${payload.message ?? "unknown error"}`);
    }
  }
}
