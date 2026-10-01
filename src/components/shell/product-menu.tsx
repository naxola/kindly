"use client";

import { Fragment } from "react";
import { ContextNavLink, useCurrentHref, type ContextNavItem } from "@/components/shell/context-nav";
import { cn } from "@/lib/cn";

export interface ProductMenuGroup {
  title?: string;
  items: ContextNavItem[];
}

/**
 * A module's second-level menu as a full-height column (docs/ui/
 * LAYOUT_NAVIGATION.md §4), after Supabase Studio's `ProductMenuBar`: a
 * header row as tall as the app header with the module name, then groups
 * with a monospace overline title, separated by rules, and a vertical rule
 * dividing the whole column from the page content to its right. `lg+` only
 * — below that the page renders the same items as a horizontal
 * `ContextNav`.
 */
export function ProductMenu({
  title,
  label,
  groups,
  className,
}: {
  title: string;
  label: string;
  groups: ProductMenuGroup[];
  className?: string;
}) {
  const currentHref = useCurrentHref();
  return (
    <div className={cn("hidden h-full w-context-nav shrink-0 flex-col border-r border-border lg:flex", className)}>
      <div className="flex h-header shrink-0 items-center border-b border-border px-4">
        <p className="truncate type-label text-foreground">{title}</p>
      </div>
      <nav aria-label={label} className="flex-1 overflow-y-auto">
        {groups.map((group, index) => (
          <Fragment key={group.title ?? index}>
            {index > 0 && <div aria-hidden className="border-t border-border" />}
            <div className="flex flex-col gap-0.5 px-2 py-4">
              {group.title && (
                <p className="mb-1.5 px-3 font-mono type-overline font-normal text-foreground-lighter">{group.title}</p>
              )}
              {group.items.map((item) => (
                <ContextNavLink key={item.href} item={item} active={currentHref === item.href} />
              ))}
            </div>
          </Fragment>
        ))}
      </nav>
    </div>
  );
}
