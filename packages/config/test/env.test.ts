import { describe, expect, it } from 'vitest'
import {
  authEnv,
  baseEnv,
  databaseEnv,
  emailEnv,
  EnvError,
  eventsEnv,
  loadMessagingEnv,
  observabilityEnv,
  parseEnv,
} from '../src/env.ts'

describe('parseEnv', () => {
  it('applies defaults and parses valid values', () => {
    const env = parseEnv(baseEnv, { APP_URL: 'http://localhost:3000' })
    expect(env).toEqual({
      NODE_ENV: 'development',
      APP_ENV: 'development',
      APP_URL: 'http://localhost:3000',
      LOG_LEVEL: 'info',
    })
  })

  it('names the invalid variables without leaking their values', () => {
    const secret = 'postgresql-not-a-url-with-password-hunter2'
    let error: unknown
    try {
      parseEnv(baseEnv.extend(databaseEnv.shape), { APP_URL: 'nope', DATABASE_URL: secret })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(EnvError)
    const message = (error as EnvError).message
    expect(message).toContain('APP_URL')
    expect(message).toContain('DATABASE_URL')
    expect(message).not.toContain('hunter2')
  })

  it('requires a long auth secret and parses the rate-limit flag', () => {
    expect(() => parseEnv(authEnv, { BETTER_AUTH_SECRET: 'short' })).toThrow(EnvError)
    const env = parseEnv(authEnv, {
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      AUTH_RATE_LIMIT_ENABLED: 'false',
    })
    expect(env.AUTH_RATE_LIMIT_ENABLED).toBe(false)
  })

  it('validates the email provider by its own fields', () => {
    expect(parseEnv(emailEnv, { EMAIL_PROVIDER: 'log', EMAIL_FROM: 'App <a@b.c>' })).toEqual({
      EMAIL_PROVIDER: 'log',
      EMAIL_FROM: 'App <a@b.c>',
    })
    expect(() =>
      parseEnv(emailEnv, { EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'x@y.z', RESEND_API_KEY: 'nope' }),
    ).toThrow(EnvError)
  })

  it('requires the events secret only when a webhook URL is set', () => {
    expect(parseEnv(eventsEnv, {})).toEqual({})
    expect(() => parseEnv(eventsEnv, { EVENTS_WEBHOOK_URL: 'https://n8n.local/hook' })).toThrow(
      /EVENTS_WEBHOOK_SECRET/,
    )
  })

  it('treats empty variables as unset (Compose and Coolify pass VAR= for blank values)', () => {
    const env = parseEnv(observabilityEnv, { SENTRY_DSN: '', ALERT_PROVIDER: '' })
    expect(env.SENTRY_DSN).toBeUndefined()
    expect(env.ALERT_PROVIDER).toBe('none')
    expect(() => parseEnv(baseEnv, { APP_URL: '' })).toThrow(/APP_URL/)
  })
})

describe('messaging env', () => {
  const complete = {
    WHATSAPP_TEST_ADAPTER_ENABLED: 'true',
    WHATSAPP_TEST_PHONE_NUMBER_ID: '123',
    WHATSAPP_TEST_ACCESS_TOKEN: 'secret-token',
    WHATSAPP_TEST_APP_SECRET: 'secret-app',
    WHATSAPP_TEST_VERIFY_TOKEN: 'secret-verify',
  }

  it('is all off by default, blanks counting as unset', () => {
    expect(loadMessagingEnv({})).toMatchObject({ WHATSAPP_TEST_ADAPTER_ENABLED: false })
    expect(
      loadMessagingEnv({
        WHATSAPP_TEST_ADAPTER_ENABLED: '',
        WHATSAPP_UNSUPPORTED_COUNTRY_CODES: '',
      }),
    ).toMatchObject({ WHATSAPP_TEST_ADAPTER_ENABLED: false })
  })

  it('needs every credential once the test adapter is enabled, naming them without their values', () => {
    expect(loadMessagingEnv({ ...complete, APP_ENV: 'staging' })).toMatchObject({
      WHATSAPP_TEST_ADAPTER_ENABLED: true,
    })
    const partial: Record<string, string> = { ...complete }
    delete partial.WHATSAPP_TEST_APP_SECRET
    expect(() => loadMessagingEnv(partial)).toThrow(/WHATSAPP_TEST_APP_SECRET/)
    try {
      loadMessagingEnv({ ...partial, WHATSAPP_TEST_ACCESS_TOKEN: '' })
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-verify')
    }
  })

  it('refuses the Meta test number in production', () => {
    expect(() => loadMessagingEnv({ ...complete, APP_ENV: 'production' })).toThrow(
      /not allowed in production/,
    )
  })
})
