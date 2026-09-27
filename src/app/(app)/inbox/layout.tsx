import type { ReactNode } from "react";
import { InboxOrderProvider } from "@/app/(app)/inbox/inbox-order-context";

/**
 * Composes the list (`children`) with the conversation panel (`@sheet`) as
 * flex siblings (docs/ui/CHAT.md §1). On a soft navigation from `/inbox` to
 * `/inbox/<id>`, Next.js intercepts and only the `@sheet` slot changes —
 * `children` keeps the already-rendered list, scroll position included. On
 * a direct load of `/inbox/<id>`, interception does not apply (`@sheet`
 * falls back to `default.tsx`, i.e. null) and `children` is `[id]/page.tsx`
 * rendering the list *and* the panel itself, in the same split layout.
 *
 * `h-full`/`min-h-0`: both panes scroll independently within `<main>`
 * (AppShell already bounds its height) instead of the whole route
 * scrolling as one block, which would drag the anchored panel away with
 * the list.
 */
export default function InboxLayout({ children, sheet }: { children: ReactNode; sheet: ReactNode }) {
  return (
    <InboxOrderProvider>
      <div className="flex h-full min-h-0">
        {children}
        {sheet}
      </div>
    </InboxOrderProvider>
  );
}
