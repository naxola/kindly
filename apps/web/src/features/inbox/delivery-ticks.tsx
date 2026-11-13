import { cn } from '@saas/ui'
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'

/** What the bubble shows: the stored status, or SENDING while the request is still in flight. */
export type DisplayStatus = 'SENDING' | 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

/** WhatsApp-style marks: a clock while sending, ✓ sent, ✓✓ delivered, coloured ✓✓ read. */
export function DeliveryTicks({ status }: { status: DisplayStatus }) {
  const t = useTranslations('inbox.conversation.status')
  const label = t(status)
  const Icon =
    status === 'FAILED'
      ? AlertCircle
      : status === 'SENDING' || status === 'PENDING'
        ? Clock
        : status === 'SENT'
          ? Check
          : CheckCheck
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-status={status}
      className={cn(
        'inline-flex',
        status === 'READ' && 'text-brand',
        status === 'FAILED' && 'text-destructive',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  )
}
