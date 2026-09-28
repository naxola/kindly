import type { ReactNode } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SkipToContent } from "@/components/shell/skip-to-content";
import { getSidebarCollapsed } from "@/components/shell/sidebar-cookie";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { countUnreadConversations } from "@/modules/conversations/service";
import type { CurrentOrganizationMember } from "@/modules/organizations/service";

/**
 * The authenticated app's frame (docs/ui/LAYOUT_NAVIGATION.md §1): header,
 * sidebar and a `<main>` that scrolls on its own. `h-dvh` + grid rows makes
 * the shell itself fixed-height so header and sidebar never scroll away —
 * only `<main>` does, same shape as Supabase Studio's own dashboard.
 */
export async function AppShell({
  member,
  children,
}: {
  member: CurrentOrganizationMember;
  children: ReactNode;
}) {
  const [collapsed, unreadCount] = await Promise.all([
    getSidebarCollapsed(),
    countUnreadConversations(member.organizationId, member),
  ]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid h-dvh grid-rows-[auto_1fr]">
        <SkipToContent />
        <AppHeader member={member} unreadCount={unreadCount} />
        <div className="grid grid-cols-[auto_1fr] overflow-hidden">
          <AppSidebar initialCollapsed={collapsed} unreadCount={unreadCount} />
          {/* Width, gutter and vertical rhythm are each page's own
              `PageContainer` (docs/ui/LAYOUT_NAVIGATION.md §5) — this is
              purely the scroll container. */}
          <main id="main" tabIndex={-1} className="overflow-y-auto outline-hidden">
            {children}
          </main>
        </div>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
