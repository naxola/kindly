"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

export interface ContextNavItem {
  href: string;
  label: string;
  count?: number;
}

/**
 * Active is the *full* current URL (path + query), not just the path:
 * `usePathname()` alone drops the query string, so every `?view=…` item
 * would otherwise compare equal to none of them.
 */
export function useCurrentHref(): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;
}

export function ContextNavLink({ item, active }: { item: ContextNavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 rounded-control px-3 py-1.5 type-label whitespace-nowrap focus-ring",
        active ? "bg-state-selected text-foreground" : "text-foreground-light hover:bg-state-hover",
      )}
    >
      {item.label}
      {typeof item.count === "number" && item.count > 0 && <span className="text-foreground-lighter">{item.count}</span>}
    </Link>
  );
}

/**
 * Module-level sub-navigation (docs/ui/LAYOUT_NAVIGATION.md §4): a vertical
 * column on `lg+`, a horizontal scroller below it. Inbox uses only its
 * horizontal form (below `lg`) — on wider screens it renders `ProductMenu`
 * instead, the full-height grouped column.
 */
export function ContextNav({ label, items, className }: { label: string; items: ContextNavItem[]; className?: string }) {
  const currentHref = useCurrentHref();
  return (
    <nav
      aria-label={label}
      className={cn("flex gap-1 overflow-x-auto lg:w-context-nav lg:shrink-0 lg:flex-col lg:overflow-visible", className)}
    >
      {items.map((item) => (
        <ContextNavLink key={item.href} item={item} active={currentHref === item.href} />
      ))}
    </nav>
  );
}
