/**
 * `EmailSender` — the only way Kindly sends email (PKG-012). Same rule as
 * `MessagingAdapter`/`LLMProvider` (`CLAUDE.md` sección 2): the domain never
 * talks to a provider directly, so Resend can be swapped without touching
 * callers.
 *
 * Which sender is used:
 * - `RESEND_API_KEY` set → Resend.
 * - Not set, outside production → prints the email to the server console,
 *   so local development works without an account. Never in production:
 *   a reset link in a log is a credential in a log (`CLAUDE.md` sección 5).
 * - Not set, in production → `null`; callers fail loudly instead of
 *   pretending an email went out.
 */
import { ResendEmailSender } from "@/modules/email/resend";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.info(`[email:console] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
  }
}

declare global {
  var __kindlyEmailSenderOverride: EmailSender | undefined;
}

/** Tests only: replace the sender for the whole process. Pass `undefined` to restore. */
export function setEmailSenderForTesting(sender: EmailSender | undefined): void {
  globalThis.__kindlyEmailSenderOverride = sender;
}

export function getEmailSender(): EmailSender | null {
  if (globalThis.__kindlyEmailSenderOverride) {
    return globalThis.__kindlyEmailSenderOverride;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return new ResendEmailSender({ apiKey, from: process.env.EMAIL_FROM || "Kindly <onboarding@resend.dev>" });
  }
  return process.env.NODE_ENV === "production" ? null : new ConsoleEmailSender();
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const sender = getEmailSender();
  if (!sender) {
    throw new Error("Email is not configured: set RESEND_API_KEY (and EMAIL_FROM).");
  }
  await sender.send(message);
}
