import nodemailer from 'nodemailer'
import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { createEmailSender, LogEmailSender, SmtpEmailSender } from '../src/email/index.ts'

const message = {
  to: 'ana@example.com',
  subject: 'Hola',
  text: 'Texto',
  html: '<p>Texto</p>',
  idempotencyKey: 'identity.invitation-email:job-1',
}

describe('email senders', () => {
  it('SMTP sends from the configured address with the idempotency header', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
    const sent: string[] = []
    transport.on('stream', () => undefined)
    const original = transport.sendMail.bind(transport)
    transport.sendMail = (async (mail: Parameters<typeof original>[0]) => {
      const info = (await original(mail)) as { message: Buffer; messageId: string }
      sent.push(info.message.toString())
      return info
    }) as typeof transport.sendMail
    const { providerMessageId } = await new SmtpEmailSender(
      transport,
      'App <no-reply@app.test>',
    ).send(message)
    expect(providerMessageId).toBeTruthy()
    expect(sent[0]).toContain('From: App <no-reply@app.test>')
    expect(sent[0]).toContain('To: ana@example.com')
    expect(sent[0]).toContain('X-Idempotency-Key: identity.invitation-email:job-1')
  })

  it('the log provider never sends, it only logs', async () => {
    const sender = createEmailSender(
      { EMAIL_PROVIDER: 'log', EMAIL_FROM: 'x@y.z' },
      pino({ level: 'silent' }),
    )
    expect(sender).toBeInstanceOf(LogEmailSender)
    expect((await sender.send(message)).providerMessageId).toBe(`log:${message.idempotencyKey}`)
  })
})
