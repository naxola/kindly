/**
 * Last line of defence of a long-running process (R5.3): an exception nobody caught or a promise
 * nobody handled leaves the process in an unknown state, so it is logged, reported, flushed and
 * the process exits with 1 for its supervisor (Docker `restart`) to start a clean one.
 * Pure: the process, logger and reporters are injected so it can be tested.
 */
export interface FatalDeps {
  proc: {
    on: (
      event: 'uncaughtException' | 'unhandledRejection',
      listener: (reason: unknown) => void,
    ) => unknown
  }
  log: { fatal: (fields: object, message: string) => void }
  capture: (error: unknown, context: { tags: Record<string, string> }) => void
  flush: () => Promise<unknown>
  exit: (code: number) => void
}

export function installFatalHandlers({ proc, log, capture, flush, exit }: FatalDeps) {
  let handling = false
  const handle = (origin: 'uncaughtException' | 'unhandledRejection') => (reason: unknown) => {
    if (handling) return
    handling = true
    const err = reason instanceof Error ? reason : new Error(`Non-error thrown: ${String(reason)}`)
    log.fatal({ err, origin }, 'fatal: the process cannot continue')
    void (async () => {
      try {
        capture(err, { tags: { fatal: 'true', origin } })
        await flush()
      } catch {
        // Reporting must never stop the exit.
      } finally {
        exit(1)
      }
    })()
  }
  proc.on('uncaughtException', handle('uncaughtException'))
  proc.on('unhandledRejection', handle('unhandledRejection'))
}
