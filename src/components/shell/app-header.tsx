import Link from "next/link";
import { MobileNav } from "@/components/shell/mobile-nav";
import { OrgMenu } from "@/components/shell/org-menu";
import { UserMenu } from "@/components/shell/user-menu";
import type { ThemePreference } from "@/components/shell/theme-preference";
import type { CurrentOrganizationMember } from "@/modules/organizations/service";

/**
 * Top bar (docs/ui/LAYOUT_NAVIGATION.md §2). The organization breadcrumb is
 * a real menu since UI-7: `/organization` exists now, so it has somewhere
 * to lead. (Through UI-6 this was plain text — that route did not exist.)
 */
export function AppHeader({
  member,
  unreadCount,
  theme,
}: {
  member: CurrentOrganizationMember;
  unreadCount: number;
  theme: ThemePreference;
}) {
  return (
    <header className="z-(--z-header) flex h-header items-center justify-between gap-3 border-b border-border bg-background px-3 md:px-gutter">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav unreadCount={unreadCount} />
        <Link href="/inbox" className="rounded-sm type-section-title font-semibold text-foreground focus-ring">
          Kindly
        </Link>
        <span aria-hidden className="hidden text-border-strong sm:inline">
          /
        </span>
        <OrgMenu organizationName={member.organizationName} />
      </div>
      <UserMenu name={member.userName} email={member.userEmail} role={member.role} initialTheme={theme} />
    </header>
  );
}
