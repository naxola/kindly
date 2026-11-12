import type { ReactNode } from "react";
import { InboxOrderProvider } from "@/app/(app)/inbox/inbox-order-context";

/**
 * `InboxWorkspace` (rendered by both `page.tsx` and `[id]/page.tsx`) holds
 * the list and the conversation panel side by side; opening/closing a
 * conversation never navigates, so there is no parallel route slot for the
 * panel any more (docs/ui/CHAT.md §1).
 *
 * `h-full`/`min-h-0`: both panes scroll independently within `<main>`
 * (AppShell already bounds its height) instead of the whole route
 * scrolling as one block.
 */
export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <InboxOrderProvider>
      <div className="flex h-full min-h-0">{children}</div>
    </InboxOrderProvider>
  );
}
