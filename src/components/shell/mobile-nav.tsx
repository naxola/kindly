"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NAV_ITEMS, isNavItemActive } from "@/components/shell/nav-items";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

/**
 * Sidebar's `< md` stand-in (docs/ui/LAYOUT_NAVIGATION.md §3): the same
 * items in a left Sheet, opened from the header. Closes itself on navigate.
 */
export function MobileNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-md" className="md:hidden" aria-label="Abrir menú">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" size="sm">
        <SheetHeader>
          <SheetTitle>Kindly</SheetTitle>
          <SheetDescription className="sr-only">Navegación principal</SheetDescription>
        </SheetHeader>
        <nav aria-label="Principal" className="flex flex-col gap-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-control px-2.5 py-2 type-label",
                  active ? "bg-state-selected text-foreground" : "text-foreground-light hover:bg-state-hover",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex flex-1 items-center justify-between gap-2">
                  {item.label}
                  {item.href === "/inbox" && <CountBadge count={unreadCount} label="conversaciones sin leer" />}
                </span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
