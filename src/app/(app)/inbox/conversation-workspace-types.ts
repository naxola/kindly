import type { CaseStatus } from "@/modules/cases/schema";
import type { ConversationThreadState } from "@/modules/conversations/service";

/**
 * Everything the conversation panel (chat + ficha) needs to render one
 * conversation, as plain JSON: served by `GET /api/conversations/<id>/workspace`
 * for a click inside the Inbox, and built by the same function for a direct
 * load of `/inbox/<id>` (docs/ui/CHAT.md §1). Dates travel as ISO strings.
 */
export interface ConversationWorkspaceData {
  conversationId: string;
  channel: string;
  contact: {
    id: string;
    name: string;
    phoneE164: string | null;
    email: string | null;
    notes: string | null;
    isUnassigned: boolean;
  };
  delegateName: string;
  /** Whether the viewer owns this Conversation's own MessagingAccount — only they can send through it (PKG-014). */
  canReply: boolean;
  /** Set only when the Contact's reference delegate is someone other than the viewer (PKG-014, "acceso temporal"). */
  referenceDelegateName: string | null;
  supportsTyping: boolean;
  threadState: ConversationThreadState;
  ficha: {
    isAdmin: boolean;
    otherContacts: { id: string; name: string }[];
    activeAssignment: WorkspaceAssignment | null;
    assignmentHistory: WorkspaceAssignment[];
    delegates: { userId: string; name: string }[];
    cases: { id: string; title: string; status: CaseStatus }[];
    /** Pending only, soonest due first (no due date last). */
    pendingTasks: { id: string; title: string; dueDate: string | null }[];
    otherConversations: { id: string; channel: string; delegateName: string; lastMessageBody: string | null }[];
  };
}

export interface WorkspaceAssignment {
  id: string;
  delegateId: string;
  delegateName: string;
  startedAt: string;
  endedAt: string | null;
}
