import { describe, expect, it } from 'vitest'
import { authEnv, baseEnv, databaseEnv, EnvError, parseEnv } from '../src/env.ts'

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
})
