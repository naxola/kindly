/**
 * Pure conversation rules: no database, unit-testable without Postgres.
 */

/**
 * A conversation is unread when it has at least one message and either it has never been opened or
 * the latest message arrived after the last time it was opened. One shared read marker per
 * organization (no per-user read state in the MVP).
 */
export function isConversationUnread(
  lastMessageCreatedAt: Date | null,
  lastReadAt: Date | null,
): boolean {
  if (!lastMessageCreatedAt) return false
  if (!lastReadAt) return true
  return lastMessageCreatedAt.getTime() > lastReadAt.getTime()
}

export type ServiceWindowStatus = 'OPEN' | 'CLOSED' | 'NOT_APPLICABLE'

export interface ServiceWindowState {
  status: ServiceWindowStatus
  /** When an OPEN window closes; null when there is no window to close. */
  expiresAt: Date | null
}

/**
 * State of the provider's free-form messaging window (WhatsApp Cloud API: 24 h from the contact's
 * last message; outside it only approved templates, docs/INTEGRATIONS.md §2.4).
 *
 * The parameter is `lastInboundAt`, not "last message", and that is the point: on a coexistence
 * channel the delegate's own messages, including the ones written on their phone and received as
 * echoes, do NOT open or extend the window. Only a message FROM the contact does.
 */
export function getServiceWindowState(
  lastInboundAt: Date | null,
  serviceWindowHours: number | null,
  now: Date,
): ServiceWindowState {
  if (serviceWindowHours === null) return { status: 'NOT_APPLICABLE', expiresAt: null }
  // The contact has never written: nothing ever opened a window.
  if (!lastInboundAt) return { status: 'CLOSED', expiresAt: null }
  const expiresAt = new Date(lastInboundAt.getTime() + serviceWindowHours * 60 * 60 * 1000)
  return { status: expiresAt.getTime() > now.getTime() ? 'OPEN' : 'CLOSED', expiresAt }
}

export type DeliveryStatusValue = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

const DELIVERY_RANK: Record<Exclude<DeliveryStatusValue, 'FAILED'>, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
}

/**
 * Whether a provider status callback should overwrite the stored one. Providers deliver
 * `sent`/`delivered`/`read` in no guaranteed order, so a late `delivered` must never undo a `read`
 * (the double tick would visibly go backwards). FAILED only overrides a message that had not
 * reached the phone; a later DELIVERED/READ beats a FAILED, because the phone saying it has the
 * message is the stronger evidence.
 */
export function shouldApplyDeliveryStatus(
  current: DeliveryStatusValue,
  next: DeliveryStatusValue,
): boolean {
  if (current === next) return false
  if (next === 'FAILED') return current === 'PENDING' || current === 'SENT'
  if (current === 'FAILED') return next === 'DELIVERED' || next === 'READ'
  return DELIVERY_RANK[next] > DELIVERY_RANK[current]
}
