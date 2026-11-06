/** Email delivery. Always from a job, with an idempotency key (ADR 0004). */
export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  /** Identifies the effect (e.g. `invitation:{id}`); the provider never sends the same one twice. */
  idempotencyKey: string
  replyTo?: string
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ providerMessageId: string }>
}
