import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { InboxListSkeleton } from "@/app/(app)/inbox/inbox-list";

/**
 * First-load skeleton (docs/ui/INBOX.md §6). Approximates the real shape;
 * `ContextNav`/`FilterBar` need live counts the loading boundary doesn't
 * have yet, so they're left out rather than faked.
 */
export default function InboxLoading() {
  return (
    <PageContainer size="full">
      <PageHeader
        title="Inbox"
        description="Conversaciones de todos los canales conectados. El sistema decide el canal al responder"
      />
      <InboxListSkeleton />
    </PageContainer>
  );
}
