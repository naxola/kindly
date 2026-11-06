import { createLogger } from '@saas/adapters/logger'
import { loadEnv } from './env.ts'
import { startWorker } from './worker.ts'

const env = loadEnv()
const log = createLogger({
  level: env.LOG_LEVEL,
  service: 'worker',
  pretty: env.NODE_ENV === 'development',
})

let stopping = false
async function main() {
  const worker = await startWorker({ env, log })
  const shutdown = async (signal: string) => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'worker stopping')
    await worker.stop()
    log.info('worker stopped')
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err: unknown) => {
  log.fatal({ err }, 'worker failed to start')
  process.exit(1)
})
