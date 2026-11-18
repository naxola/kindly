import { ALL_JOBS } from '@saas/core'
import { describe, expect, it } from 'vitest'
import { loadEmailEnv, loadEnv } from '../src/env.ts'
import { registrations } from '../src/handlers.ts'

describe('worker registry', () => {
  it('every job defined in core has exactly one consumer', () => {
    const registered = registrations.map((r) => r.job.name)
    expect(new Set(registered).size).toBe(registered.length)
    expect(registered.sort()).toEqual(ALL_JOBS.map((j) => j.name).sort())
  })
})

describe('worker configuration', () => {
  const base = { APP_URL: 'http://localhost:3000', DATABASE_URL: 'postgresql://u:p@h:5432/d' }

  it('parses the list of queues to consume', () => {
    const env = loadEnv({ ...base, WORKER_QUEUES: 'events.deliver, identity.invitation-email' })
    expect(env.WORKER_QUEUES).toEqual(['events.deliver', 'identity.invitation-email'])
  })

  it('refuses the log email provider outside development and test', () => {
    const source = { EMAIL_PROVIDER: 'log', EMAIL_FROM: 'App <a@b.c>' }
    expect(loadEmailEnv('development', source).EMAIL_PROVIDER).toBe('log')
    expect(() => loadEmailEnv('staging', source)).toThrow(/not allowed/)
  })
})
