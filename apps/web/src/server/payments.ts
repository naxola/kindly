import 'server-only'
import { createPaymentProvider } from '@saas/adapters/payments'
import { loadPaymentEnv } from '@saas/config/env'
import type { PaymentProvider } from '@saas/core'

const globalForPayments = globalThis as unknown as { __payments?: PaymentProvider | null }

/** Payment provider (ADR 0012), or null with PAYMENT_PROVIDER=none. Validated on first use. */
export function payments(): PaymentProvider | null {
  if (globalForPayments.__payments === undefined) {
    globalForPayments.__payments = createPaymentProvider(loadPaymentEnv())
  }
  return globalForPayments.__payments
}
