import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { InboxListSkeleton } from "@/app/(app)/inbox/inbox-list";

/**
 * First-load skeleton (docs/ui/INBOX.md §6). Approximates the real shape;
 * the `FilterBar` needs live counts the loading boundary doesn't have yet,
 * so it's left out rather than faked.
 */
export default function InboxLoading() {
  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="h-full min-w-0 flex-1 overflow-y-auto">
        <PageContainer size="full">
          <PageHeader
            title="Conversaciones"
            description="Todas las conversaciones de tus canales conectados, la más reciente primero"
          />
          <InboxListSkeleton />
        </PageContainer>
      </div>
    </div>
  );
}
