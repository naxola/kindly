import Link from "next/link";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";
import type { CurrentOrganizationMember } from "@/modules/organizations/service";

/**
 * Top bar (docs/ui/LAYOUT_NAVIGATION.md §2). The organization name is plain
 * text, not yet the dropdown the design calls for: that opens onto
 * `/organization`, which does not exist until UI-7. Making it interactive
 * earlier would be a menu that leads nowhere.
 */
export function AppHeader({ member, unreadCount }: { member: CurrentOrganizationMember; unreadCount: number }) {
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
        <span className="hidden truncate type-caption text-foreground-lighter sm:inline">
          {member.organizationName} · {member.role}
        </span>
      </div>
      <UserMenu name={member.userName} email={member.userEmail} role={member.role} />
    </header>
  );
}
