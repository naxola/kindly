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
