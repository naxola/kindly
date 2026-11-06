import { Writable } from 'node:stream'
import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { REDACT_PATHS } from '../src/logger/index.ts'

describe('log redaction', () => {
  it('hides passwords, tokens and authentication headers', () => {
    const lines: string[] = []
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString())
        cb()
      },
    })
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink)
    log.info({
      password: 'p4ss',
      user: { token: 'abc', email: 'a@b.c' },
      headers: { authorization: 'Bearer xyz', cookie: 'sid=1' },
    })
    const out = lines.join('')
    expect(out).not.toMatch(/p4ss|abc|Bearer xyz|sid=1/)
    expect(out).toContain('[REDACTED]')
  })
})
