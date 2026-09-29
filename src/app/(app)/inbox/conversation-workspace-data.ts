import "server-only";
import { listOrganizationMembers, type CurrentOrganizationMember } from "@/modules/organizations/service";
import {
  channelSupportsTypingIndicator,
  getConversationThreadState,
  getConversationWithDetails,
  listConversationsWithPreview,
} from "@/modules/conversations/service";
import { listContactsForMember } from "@/modules/contacts/service";
import { getActiveAssignment, listAssignmentHistory, type ContactAssignment } from "@/modules/contacts/assignments";
import { getCurrentMembership } from "@/modules/memberships/service";
import { listCasesForContact } from "@/modules/cases/service";
import { isTaskPending, listTasksForContact } from "@/modules/tasks/service";
import type { ConversationWorkspaceData, WorkspaceAssignment } from "@/app/(app)/inbox/conversation-workspace-types";

/**
 * Builds the conversation panel's data (`ConversationWorkspaceData`),
 * visibility-checked for `member` like every other read — `null` exactly
 * when `getConversationWithDetails` is (not found, or not visible to them).
 */
export async function getConversationWorkspace(
  member: CurrentOrganizationMember,
  conversationId: string,
  { markRead }: { markRead: boolean },
): Promise<ConversationWorkspaceData | null> {
  const { organizationId } = member;
  const details = await getConversationWithDetails(organizationId, member, conversationId);
  if (!details) {
    return null;
  }
  const contactId = details.contact.id;

  const [threadState, members, contacts, activeAssignment, history, membership, cases, tasks, contactConversations] =
    await Promise.all([
      getConversationThreadState(organizationId, member, conversationId, { markRead }),
      listOrganizationMembers(organizationId),
      listContactsForMember(organizationId, member),
      getActiveAssignment(organizationId, contactId),
      listAssignmentHistory(organizationId, contactId),
      getCurrentMembership(organizationId, contactId),
      listCasesForContact(organizationId, member, contactId),
      listTasksForContact(organizationId, member, contactId),
      listConversationsWithPreview(organizationId, member, { contactId }),
    ]);
  if (!threadState) {
    return null;
  }

  const nameById = new Map(members.map((m) => [m.userId, m.name]));
  const toAssignment = (assignment: ContactAssignment): WorkspaceAssignment => ({
    id: assignment.id,
    delegateId: assignment.delegateId,
    delegateName: nameById.get(assignment.delegateId) ?? "—",
    startedAt: assignment.startedAt.toISOString(),
    endedAt: assignment.endedAt?.toISOString() ?? null,
  });

  return {
    conversationId,
    channel: details.conversation.channel,
    contact: {
      id: contactId,
      name: details.contact.name,
      phoneE164: details.contact.phoneE164,
      email: details.contact.email,
      notes: details.contact.notes,
      isUnassigned: details.contact.isUnassigned,
    },
    delegateName: nameById.get(details.delegateId) ?? "—",
    // PKG-014: this Conversation's own account may not belong to the viewer
    // (they can still see it as the Contact's reference delegate, or via
    // "acceso temporal") — replying is only ever through your own number.
    canReply: details.delegateId === member.userId,
    referenceDelegateName:
      details.referenceDelegateId && details.referenceDelegateId !== member.userId
        ? (nameById.get(details.referenceDelegateId) ?? "—")
        : null,
    supportsTyping: channelSupportsTypingIndicator(details.conversation.channel),
    threadState,
    ficha: {
      isAdmin: member.role === "ADMIN",
      otherContacts: contacts.filter((c) => c.id !== contactId).map((c) => ({ id: c.id, name: c.name })),
      activeAssignment: activeAssignment ? toAssignment(activeAssignment) : null,
      assignmentHistory: history.map(toAssignment),
      delegates: members.map((m) => ({ userId: m.userId, name: m.name })),
      membership: membership
        ? {
            status: membership.status,
            memberNumber: membership.memberNumber,
            startedAt: membership.startedAt.toISOString(),
            endedAt: membership.endedAt?.toISOString() ?? null,
            feePaidUntil: membership.feePaidUntil,
          }
        : null,
      cases: cases.map((c) => ({ id: c.id, title: c.title, status: c.status })),
      pendingTasks: tasks
        .filter(isTaskPending)
        .sort((a, b) => {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.getTime() - b.dueDate.getTime();
        })
        .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate?.toISOString() ?? null })),
      otherConversations: contactConversations
        .filter((c) => c.id !== conversationId)
        .map((c) => ({
          id: c.id,
          channel: c.channel,
          delegateName: nameById.get(c.delegateId) ?? "—",
          lastMessageBody: c.lastMessage?.body ?? null,
        })),
    },
  };
}
