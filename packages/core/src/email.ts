/** Email delivery. Always from a job, with an idempotency key (ADR 0004). */
export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  /** Identifies the effect (e.g. `invitation:{id}`); the provider never sends the same one twice. */
  idempotencyKey: string
  replyTo?: string
  /**
   * `access`: needed to get into the account (verification, password recovery). Only a permanent
   * bounce stops it; a spam complaint does not (ADR 0017). Default: `notification`.
   */
  category?: 'access' | 'notification'
}

export interface EmailSender {
  /** `suppressed`: not sent because the address is on the suppression list (ADR 0017). */
  send(message: EmailMessage): Promise<{ providerMessageId: string; suppressed?: boolean }>
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

/** Text of a transactional email with one call to action. */
export interface ActionEmail {
  subject: string
  intro: string
  action: string
  outro: string
}

export type RenderedEmail = Omit<EmailMessage, 'to' | 'idempotencyKey'>

/** Plain text and minimal HTML (escaped) of a one-action email. Shared by every module. */
export function renderActionEmail(t: ActionEmail, url: string, greeting: string): RenderedEmail {
  const text = `${greeting}\n\n${t.intro}\n\n${t.action}: ${url}\n\n${t.outro}\n`
  const html = `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(t.intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(t.action)}</a></p><p style="color:#666">${escapeHtml(t.outro)}</p>`
  return { subject: t.subject, text, html }
}
