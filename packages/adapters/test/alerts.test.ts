import { describe, expect, it, vi } from 'vitest'
import {
  createAlertSender,
  NtfyAlertSender,
  TelegramAlertSender,
  throttledAlerts,
  type Alert,
  type AlertSender,
} from '../src/alerts/index.ts'
import { createLogger } from '../src/logger/index.ts'

const log = createLogger({ level: 'silent', service: 'test' })
const alert: Alert = { key: 'k', severity: 'critical', title: 'Job failed', body: 'details' }
const ok = () => vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

describe('alert senders', () => {
  it('ntfy posts to the topic with title, priority and token', async () => {
    const fetch = ok()
    await new NtfyAlertSender('https://ntfy.test/topic', 'tok', fetch).send(alert)
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(url).toBe('https://ntfy.test/topic')
    expect(init.body).toBe('details')
    expect(headers).toMatchObject({
      Title: 'Job failed',
      Priority: 'urgent',
      Authorization: 'Bearer tok',
    })
  })

  it('telegram sends the message to the chat', async () => {
    const fetch = ok()
    await new TelegramAlertSender('123:abc', '42', fetch).send({ ...alert, severity: 'warning' })
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage')
    expect(JSON.parse(init.body as string)).toEqual({
      chat_id: '42',
      text: '⚠️ Job failed\n\ndetails',
    })
  })

  it('a non 2xx answer is an error without the token in it', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    const send = new TelegramAlertSender('123:secret', '42', fetch).send(alert)
    await expect(send).rejects.toThrow('Telegram answered 401')
    await expect(send).rejects.not.toThrow(/secret/)
  })

  it('createAlertSender picks the provider from the environment', async () => {
    const fetch = ok()
    await createAlertSender(
      { ALERT_PROVIDER: 'ntfy', NTFY_URL: 'https://ntfy.test/t' },
      log,
      fetch,
    ).send(alert)
    expect(fetch).toHaveBeenCalledOnce()
    const none = vi.fn()
    await createAlertSender({ ALERT_PROVIDER: 'none' }, log, none).send(alert)
    expect(none).not.toHaveBeenCalled()
  })
})

describe('throttledAlerts', () => {
  it('sends a key once per window', async () => {
    let now = 0
    const send = vi.fn<AlertSender['send']>().mockResolvedValue(undefined)
    const alerts = throttledAlerts({ send }, log, { windowMs: 1000, now: () => now })
    await alerts.send(alert)
    await alerts.send(alert)
    await alerts.send({ ...alert, key: 'other' })
    now = 1500
    await alerts.send(alert)
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('never throws when the channel fails', async () => {
    const inner: AlertSender = { send: vi.fn().mockRejectedValue(new Error('down')) }
    await expect(throttledAlerts(inner, log).send(alert)).resolves.toBeUndefined()
  })
})
