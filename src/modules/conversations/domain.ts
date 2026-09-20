/**
 * Pure domain logic for Conversation, with no I/O and no `server-only`
 * guard on purpose — importable from plain unit tests without pulling in
 * the database client (same pattern as tasks/domain.ts).
 */

/**
 * A conversation is unread when it has at least one message and either it
 * has never been opened, or the latest message arrived after the last time
 * it was opened. No per-user read state in this MVP (docs/DECISIONS.md,
 * bloque "PKG-004") — one shared value per organization.
 */
export function isConversationUnread(lastMessageCreatedAt: Date | null, lastReadAt: Date | null): boolean {
  if (!lastMessageCreatedAt) {
    return false;
  }
  if (!lastReadAt) {
    return true;
  }
  return lastMessageCreatedAt.getTime() > lastReadAt.getTime();
}

export type ServiceWindowStatus = "OPEN" | "CLOSED" | "NOT_APPLICABLE";

export interface ServiceWindowState {
  status: ServiceWindowStatus;
  /** When an OPEN window closes; null when there is no window to close. */
  expiresAt: Date | null;
}

/**
 * State of the provider's free-form messaging window for a conversation
 * (PKG-005). WhatsApp Cloud API only allows free-form replies within 24h of
 * the Contact's last message; outside it, only pre-approved templates
 * (docs/INTEGRATIONS.md sección 2.4).
 *
 * The parameter is `lastInboundAt`, not "last message", and that is the
 * whole point: on a coexistence channel the delegate's own messages —
 * including the ones they write on their phone and we receive as echoes —
 * do **not** open or extend the window. Only a message *from* the Contact
 * does. Feeding this the latest message of any direction would quietly
 * report an open window over a conversation Kindly cannot actually reply
 * to.
 *
 * `serviceWindowHours` comes from the channel's adapter capabilities, so no
 * provider name is ever hardcoded here.
 */
export function getServiceWindowState(
  lastInboundAt: Date | null,
  serviceWindowHours: number | null,
  now: Date,
): ServiceWindowState {
  if (serviceWindowHours === null) {
    return { status: "NOT_APPLICABLE", expiresAt: null };
  }
  if (!lastInboundAt) {
    // The Contact has never written: nothing ever opened a window.
    return { status: "CLOSED", expiresAt: null };
  }

  const expiresAt = new Date(lastInboundAt.getTime() + serviceWindowHours * 60 * 60 * 1000);
  return {
    status: expiresAt.getTime() > now.getTime() ? "OPEN" : "CLOSED",
    expiresAt,
  };
}
