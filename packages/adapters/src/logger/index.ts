import pino, { type Logger, type LoggerOptions } from 'pino'

export type { Logger }

/**
 * Fields that must never appear in logs (ADR 0008).
 * Applied at the usual nesting levels.
 */
export const REDACT_PATHS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  '*.password',
  '*.token',
  '*.secret',
  '*.authorization',
  '*.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
]

export interface CreateLoggerOptions {
  level: LoggerOptions['level']
  service: string
  pretty?: boolean
}

export function createLogger({ level, service, pretty = false }: CreateLoggerOptions): Logger {
  return pino({
    level,
    base: { service },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  })
}
