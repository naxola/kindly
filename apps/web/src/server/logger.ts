import 'server-only'
import { createLogger, type Logger } from '@saas/adapters/logger'
import { env } from './env.ts'

const globalForLogger = globalThis as unknown as { __logger?: Logger }

export function logger(): Logger {
  globalForLogger.__logger ??= createLogger({
    level: env().LOG_LEVEL,
    service: 'web',
    pretty: env().NODE_ENV === 'development',
  })
  return globalForLogger.__logger
}
