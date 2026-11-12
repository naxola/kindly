import { z } from 'zod'

/**
 * Environment schemas, one per concern. Each process (web, site, worker) validates
 * only the ones it needs at startup: if a variable is missing, it does not start.
 * Later phases add their own schemas here (auth, email, storage…).
 */

export const baseEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_URL: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export const databaseEnv = z.object({
  /** Application connection (role app_user, subject to RLS). */
  DATABASE_URL: z.url(),
})

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1')

export const authEnv = z.object({
  /** Better Auth secret (signs cookies and tokens). At least 32 characters. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Rate limiting of the authentication endpoints. */
  AUTH_RATE_LIMIT_ENABLED: bool.default(true),
})

export const emailEnv = z.discriminatedUnion('EMAIL_PROVIDER', [
  /** Prints emails to the worker log. Local development and tests only. */
  z.object({ EMAIL_PROVIDER: z.literal('log'), EMAIL_FROM: z.string().min(3) }),
  /** SMTP: a sandbox such as Mailtrap in development. */
  z.object({
    EMAIL_PROVIDER: z.literal('smtp'),
    EMAIL_FROM: z.string().min(3),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),
  }),
  /** Resend: staging and production. */
  z.object({
    EMAIL_PROVIDER: z.literal('resend'),
    EMAIL_FROM: z.string().min(3),
    RESEND_API_KEY: z.string().startsWith('re_'),
  }),
])

/**
 * Business events webhook (n8n or similar). Without URL, events are recorded as
 * delivered-to-nobody in the worker log; with URL, the secret is mandatory.
 */
export const eventsEnv = z
  .object({
    EVENTS_WEBHOOK_URL: z.url().optional(),
    EVENTS_WEBHOOK_SECRET: z.string().min(32).optional(),
  })
  .refine((e) => !e.EVENTS_WEBHOOK_URL || e.EVENTS_WEBHOOK_SECRET, {
    path: ['EVENTS_WEBHOOK_SECRET'],
    message: 'Required when EVENTS_WEBHOOK_URL is set',
  })

/** Public site (apps/site). Read at build time: the pages are prerendered. */
export const siteEnv = z.object({
  /** Public URL of the site (canonical URLs, sitemap, RSS, Open Graph). */
  SITE_URL: z.url(),
  /** Public URL of the app (sign-in and sign-up links). */
  APP_URL: z.url(),
  /** Plausible domain. Empty: no analytics script at all. */
  PLAUSIBLE_DOMAIN: z.string().min(3).optional(),
})

/**
 * Observability (ADR 0008). Everything is optional: without values, errors are only logged
 * and alerts only go to the log, so a fresh clone works without any account.
 */
export const observabilityEnv = z
  .object({
    /** Sentry or GlitchTip (same protocol). Empty: error tracking disabled. */
    SENTRY_DSN: z.url().optional(),
    ALERT_PROVIDER: z.enum(['none', 'ntfy', 'telegram']).default('none'),
    /** ntfy topic URL, e.g. https://ntfy.sh/my-secret-topic or a self-hosted one. */
    NTFY_URL: z.url().optional(),
    /** Access token of a protected ntfy topic. */
    NTFY_TOKEN: z.string().min(1).optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.ALERT_PROVIDER === 'ntfy' && !e.NTFY_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['NTFY_URL'],
        message: 'Required with ALERT_PROVIDER=ntfy',
      })
    }
    if (e.ALERT_PROVIDER === 'telegram') {
      for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] as const) {
        if (!e[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required with ALERT_PROVIDER=telegram',
          })
      }
    }
  })

/**
 * Payment provider (ADR 0012). `none`: plans can only be the default one (no checkout).
 * Paddle keys are per environment: sandbox keys only work against the sandbox API.
 */
export const paymentEnv = z.discriminatedUnion('PAYMENT_PROVIDER', [
  z.object({ PAYMENT_PROVIDER: z.literal('none') }),
  z.object({
    PAYMENT_PROVIDER: z.literal('paddle'),
    PADDLE_ENVIRONMENT: z.enum(['sandbox', 'production']),
    /** Server API key (pdl_sdbx_apikey_… / pdl_live_apikey_…). Secret. */
    PADDLE_API_KEY: z.string().startsWith('pdl_'),
    /** Client-side token for Paddle.js. Public by design. */
    PADDLE_CLIENT_TOKEN: z.string().min(10),
    /** Secret of the notification destination (pdl_ntfset_…). */
    PADDLE_WEBHOOK_SECRET: z.string().min(10),
    /** Paddle product the overage charges are attached to. */
    PADDLE_OVERAGE_PRODUCT_ID: z.string().startsWith('pro_'),
  }),
])

export type BaseEnv = z.infer<typeof baseEnv>
export type DatabaseEnv = z.infer<typeof databaseEnv>
export type AuthEnv = z.infer<typeof authEnv>
export type EmailEnv = z.infer<typeof emailEnv>
export type EventsEnv = z.infer<typeof eventsEnv>
export type SiteEnv = z.infer<typeof siteEnv>
export type ObservabilityEnv = z.infer<typeof observabilityEnv>
export type PaymentEnv = z.infer<typeof paymentEnv>

/** Payment configuration; without PAYMENT_PROVIDER there is no provider (`none`). */
export const loadPaymentEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(paymentEnv, { ...source, PAYMENT_PROVIDER: source.PAYMENT_PROVIDER || 'none' })

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`)
    this.name = 'EnvError'
  }
}

/**
 * Validates environment variables against a schema. The error never includes the
 * values, only the variable names and the reason. An empty variable counts as unset
 * (Docker Compose and Coolify pass `VAR=` for optional values left blank).
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const present = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''))
  const result = schema.safeParse(present)
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    )
  }
  return result.data
}
