"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV_ITEMS, isNavItemActive, type NavItem } from "@/components/shell/nav-items";
import { setSidebarCollapsed } from "@/components/shell/sidebar-actions";
import { CountBadge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

/**
 * Global navigation (docs/ui/LAYOUT_NAVIGATION.md §3). Hidden below `md`
 * (the header's `MobileNav` Sheet takes over there).
 */
export function AppSidebar({ initialCollapsed, unreadCount }: { initialCollapsed: boolean; unreadCount: number }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !collapsed;
    setCollapsed(next); // instant for this session
    startTransition(() => {
      void setSidebarCollapsed(next); // persisted for the next full load
    });
  }

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col border-r border-border bg-background-muted transition-[width] duration-(--duration-base) ease-standard md:flex",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar",
      )}
    >
      <nav aria-label="Principal" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isNavItemActive(pathname, item.href)}
            collapsed={collapsed}
            count={item.href === "/inbox" ? unreadCount : undefined}
          />
        ))}
      </nav>
      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 type-label text-foreground-light hover:bg-state-hover focus-ring"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" aria-hidden />
          )}
          <span className={cn(collapsed && "sr-only")}>{collapsed ? "Expandir menú" : "Contraer menú"}</span>
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  count,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  count?: number;
}) {
  const Icon = item.icon;
  const link: ReactNode = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-control px-2.5 py-2 type-label focus-ring",
        collapsed && "justify-center px-0",
        active ? "bg-state-selected text-foreground" : "text-foreground-light hover:bg-state-hover",
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />}
      <Icon className="size-4 shrink-0" aria-hidden />
      {!collapsed && (
        <span className="flex flex-1 items-center justify-between gap-2 truncate">
          {item.label}
          {typeof count === "number" && <CountBadge count={count} label="conversaciones sin leer" />}
        </span>
      )}
    </Link>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {typeof count === "number" && count > 0 ? ` (${count})` : ""}
      </TooltipContent>
    </Tooltip>
  );
}
