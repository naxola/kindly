import type { ObservabilityEnv } from '@saas/config/env'
import type { Logger } from '../logger/index.ts'

/**
 * Alerts to the operator's phone (ADR 0008). Only for what needs a human now: a job that
 * failed for good, a stuck queue. Never personal data or secrets in the text.
 */
export interface Alert {
  title: string
  body: string
  severity: 'warning' | 'critical'
  /** Same key within the throttle window = one alert (no storms). */
  key: string
}

export interface AlertSender {
  send(alert: Alert): Promise<void>
}

type Fetch = typeof fetch

/** ntfy (ntfy.sh or self-hosted): POST to the topic URL. */
export class NtfyAlertSender implements AlertSender {
  constructor(
    private readonly url: string,
    private readonly token?: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async send(alert: Alert) {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: {
        Title: alert.title,
        Priority: alert.severity === 'critical' ? 'urgent' : 'default',
        Tags: alert.severity === 'critical' ? 'rotating_light' : 'warning',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: alert.body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`ntfy answered ${res.status}`)
  }
}

/** Telegram bot message to a chat. The token never appears in errors or logs. */
export class TelegramAlertSender implements AlertSender {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async send(alert: Alert) {
    const icon = alert.severity === 'critical' ? '🚨' : '⚠️'
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: `${icon} ${alert.title}\n\n${alert.body}`,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Telegram answered ${res.status}`)
  }
}

/** Without provider: the alert is a log line at its level. */
export class LogAlertSender implements AlertSender {
  constructor(private readonly log: Logger) {}

  send(alert: Alert) {
    const fields = { alert: { title: alert.title, body: alert.body, key: alert.key } }
    if (alert.severity === 'critical') this.log.error(fields, 'alert')
    else this.log.warn(fields, 'alert')
    return Promise.resolve()
  }
}

/**
 * Sends each key at most once per window, and never lets a failing alert channel break
 * the caller: an alert that cannot be delivered is logged instead.
 */
export function throttledAlerts(
  sender: AlertSender,
  log: Logger,
  {
    windowMs = 15 * 60_000,
    now = () => Date.now(),
  }: { windowMs?: number; now?: () => number } = {},
): AlertSender {
  const lastSent = new Map<string, number>()
  return {
    async send(alert) {
      const at = now()
      const previous = lastSent.get(alert.key)
      if (previous !== undefined && at - previous < windowMs) return
      lastSent.set(alert.key, at)
      try {
        await sender.send(alert)
      } catch (err) {
        log.error({ err, alert: { title: alert.title, key: alert.key } }, 'alert not delivered')
      }
    },
  }
}

export function createAlertSender(
  env: ObservabilityEnv,
  log: Logger,
  fetchImpl?: Fetch,
): AlertSender {
  const base =
    env.ALERT_PROVIDER === 'ntfy'
      ? new NtfyAlertSender(env.NTFY_URL!, env.NTFY_TOKEN, fetchImpl)
      : env.ALERT_PROVIDER === 'telegram'
        ? new TelegramAlertSender(env.TELEGRAM_BOT_TOKEN!, env.TELEGRAM_CHAT_ID!, fetchImpl)
        : new LogAlertSender(log)
  return throttledAlerts(base, log)
}
