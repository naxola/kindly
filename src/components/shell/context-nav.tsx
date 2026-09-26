"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface ContextNavItem {
  href: string;
  label: string;
  count?: number;
}

/**
 * Module-level sub-navigation (docs/ui/LAYOUT_NAVIGATION.md §4): a vertical
 * column on `lg+`, a horizontal scroller below it. Not called by any page
 * yet — Inbox's views (UI-5) and Organización's sections (UI-7) are its
 * first callers; built now so those phases compose it instead of each
 * inventing its own tab strip.
 */
export function ContextNav({ label, items }: { label: string; items: ContextNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="flex gap-1 overflow-x-auto lg:w-context-nav lg:shrink-0 lg:flex-col lg:overflow-visible"
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-control px-3 py-1.5 type-label whitespace-nowrap",
              active ? "bg-state-selected text-foreground" : "text-foreground-light hover:bg-state-hover",
            )}
          >
            {item.label}
            {typeof item.count === "number" && item.count > 0 && (
              <span className="ml-1.5 text-foreground-lighter">{item.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
