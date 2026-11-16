import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { installFatalHandlers } from '../src/errors/fatal.ts'

function setup(overrides: { flush?: () => Promise<unknown>; capture?: () => void } = {}) {
  const proc = new EventEmitter()
  const exit = vi.fn()
  const fatal = vi.fn()
  const capture = vi.fn((_error: unknown, _context: object) => overrides.capture?.())
  installFatalHandlers({
    proc,
    log: { fatal },
    capture,
    flush: overrides.flush ?? (() => Promise.resolve(true)),
    exit,
  })
  const settle = () => new Promise((r) => setTimeout(r, 0))
  return { proc, exit, fatal, capture, settle }
}

describe('installFatalHandlers', () => {
  it('logs, reports, flushes and exits 1 on an uncaught exception', async () => {
    const { proc, exit, fatal, capture, settle } = setup()
    proc.emit('uncaughtException', new Error('boom'))
    await settle()
    expect(fatal).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'uncaughtException' }),
      expect.any(String),
    )
    expect(capture).toHaveBeenCalledWith(expect.any(Error), {
      tags: { fatal: 'true', origin: 'uncaughtException' },
    })
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('treats an unhandled rejection the same, also when the reason is not an Error', async () => {
    const { proc, exit, capture, settle } = setup()
    proc.emit('unhandledRejection', 'just a string')
    await settle()
    expect(capture.mock.calls[0]![0]).toBeInstanceOf(Error)
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('still exits if reporting or flushing fails', async () => {
    const a = setup({ flush: () => Promise.reject(new Error('flush failed')) })
    a.proc.emit('uncaughtException', new Error('x'))
    await a.settle()
    expect(a.exit).toHaveBeenCalledExactlyOnceWith(1)

    const b = setup({
      capture: () => {
        throw new Error('capture failed')
      },
    })
    b.proc.emit('unhandledRejection', new Error('y'))
    await b.settle()
    expect(b.exit).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('handles only the first failure: later ones during the exit do not repeat it', async () => {
    const { proc, exit, fatal, settle } = setup()
    proc.emit('uncaughtException', new Error('first'))
    proc.emit('unhandledRejection', new Error('second'))
    await settle()
    expect(fatal).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
  })
})
