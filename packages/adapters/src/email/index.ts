import type { EmailEnv } from '@saas/config/env'
import type { EmailMessage, EmailSender } from '@saas/core'
import nodemailer, { type Transporter } from 'nodemailer'
import { Resend } from 'resend'
import type { Logger } from '../logger/index.ts'

/**
 * Local development only: logs the email instead of sending it. The body may contain
 * one-time links, which is acceptable on a developer machine and nowhere else — the
 * worker refuses this provider outside development and test.
 */
export class LogEmailSender implements EmailSender {
  constructor(private readonly log: Logger) {}

  send(message: EmailMessage) {
    this.log.info(
      { email: { to: message.to, subject: message.subject, text: message.text } },
      'email (log provider, not sent)',
    )
    return Promise.resolve({ providerMessageId: `log:${message.idempotencyKey}` })
  }
}

/** SMTP: a sandbox such as Mailtrap in development. */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage) {
    const info = (await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      headers: { 'X-Idempotency-Key': message.idempotencyKey },
    })) as { messageId: string }
    return { providerMessageId: info.messageId }
  }
}

/** Resend: staging and production. Resend drops resends with the same Idempotency-Key. */
export class ResendEmailSender implements EmailSender {
  private readonly client: Resend

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey)
  }

  async send(message: EmailMessage) {
    const { data, error } = await this.client.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      },
      { idempotencyKey: message.idempotencyKey },
    )
    if (error || !data) throw new Error(`Resend error: ${error?.name ?? 'unknown'}`)
    return { providerMessageId: data.id }
  }
}

export function createEmailSender(env: EmailEnv, log: Logger): EmailSender {
  switch (env.EMAIL_PROVIDER) {
    case 'log':
      return new LogEmailSender(log)
    case 'resend':
      return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM)
    case 'smtp':
      return new SmtpEmailSender(
        nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        }),
        env.EMAIL_FROM,
      )
  }
}
