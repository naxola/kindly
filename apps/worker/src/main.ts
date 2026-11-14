import { flushErrors, captureError, installFatalHandlers } from '@saas/adapters/errors'
import { createLogger } from '@saas/adapters/logger'
import { loadEnv } from './env.ts'
import { startWorker } from './worker.ts'

const env = loadEnv()
const log = createLogger({
  level: env.LOG_LEVEL,
  service: 'worker',
  pretty: env.NODE_ENV === 'development',
})

// Anything uncaught ends the process with 1 so Docker starts a clean one (R5.3).
installFatalHandlers(log)

let stopping = false
async function main() {
  const worker = await startWorker({ env, log })
  const shutdown = async (signal: string) => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'worker stopping')
    let code = 0
    try {
      await worker.stop()
      log.info('worker stopped')
    } catch (err) {
      // A failed shutdown must be visible and must still end the process.
      code = 1
      log.error({ err }, 'worker failed to stop cleanly')
      captureError(err, { tags: { phase: 'shutdown' } })
    } finally {
      await flushErrors().catch(() => undefined)
      process.exit(code)
    }
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err: unknown) => {
  log.fatal({ err }, 'worker failed to start')
  process.exit(1)
})
