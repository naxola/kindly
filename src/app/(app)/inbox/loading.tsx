import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { InboxListSkeleton } from "@/app/(app)/inbox/inbox-list";

/**
 * First-load skeleton (docs/ui/INBOX.md §6). Approximates the real shape —
 * an empty product-menu column keeps the list from jumping sideways when
 * the real one arrives; its items and the `FilterBar` need live counts the
 * loading boundary doesn't have yet, so they're left out rather than faked.
 */
export default function InboxLoading() {
  return (
    <div className="flex h-full min-w-0 flex-1">
      <div aria-hidden className="hidden h-full w-context-nav shrink-0 border-r border-border lg:block" />
      <div className="h-full min-w-0 flex-1 overflow-y-auto">
        <PageContainer size="full">
          <PageHeader
            title="Inbox"
            description="Conversaciones de todos los canales conectados. El sistema decide el canal al responder"
          />
          <InboxListSkeleton />
        </PageContainer>
      </div>
    </div>
  );
}
