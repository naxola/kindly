/**
 * Pure domain logic for MessagingAccount, with no I/O and no `server-only`
 * guard on purpose — importable from plain unit tests without pulling in
 * the database client (same pattern as conversations/domain.ts).
 */
import type { MessagingAccountStatus } from "@/modules/messaging/schema";

export type AccountStatusTone = "ok" | "pending" | "warning" | "error" | "inactive";

export interface AccountStatusDescriptor {
  tone: AccountStatusTone;
  /** Whether a human has to do something about it — drives what the UI puts first. */
  needsAttention: boolean;
  /** Whether messages can flow right now. */
  operational: boolean;
}

/**
 * What each `MessagingAccount.status` actually means for the person looking
 * at it (PKG-007). Through PKG-006 the status was printed as raw text, so
 * `DEGRADED` and `REVOKED` looked exactly as fine as `CONNECTED`.
 *
 * `DEGRADED` counts as operational but needing attention: messages still
 * flow, which is precisely why it is easy to ignore until it turns into
 * `ERROR`.
 */
export function describeAccountStatus(status: MessagingAccountStatus): AccountStatusDescriptor {
  switch (status) {
    case "CONNECTED":
      return { tone: "ok", needsAttention: false, operational: true };
    case "PENDING":
    case "CONNECTING":
      return { tone: "pending", needsAttention: false, operational: false };
    case "DEGRADED":
      return { tone: "warning", needsAttention: true, operational: true };
    case "ERROR":
    case "REVOKED":
      return { tone: "error", needsAttention: true, operational: false };
    case "DISCONNECTED":
      return { tone: "inactive", needsAttention: false, operational: false };
  }
}
