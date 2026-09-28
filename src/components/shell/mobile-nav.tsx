"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NAV_ITEMS, ORGANIZATION_NAV_ITEM, isNavItemActive, type NavItem } from "@/components/shell/nav-items";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/primitives";
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
          {NAV_ITEMS.map((item) => (
            <MobileNavLink key={item.href} item={item} active={isNavItemActive(pathname, item.href)} onNavigate={() => setOpen(false)}>
              {item.href === "/inbox" && <CountBadge count={unreadCount} label="conversaciones sin leer" />}
            </MobileNavLink>
          ))}
          <Separator className="my-2" />
          <MobileNavLink
            item={ORGANIZATION_NAV_ITEM}
            active={isNavItemActive(pathname, ORGANIZATION_NAV_ITEM.href)}
            onNavigate={() => setOpen(false)}
          />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavLink({
  item,
  active,
  onNavigate,
  children,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
  children?: React.ReactNode;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-control px-2.5 py-2 type-label",
        active ? "bg-state-selected text-foreground" : "text-foreground-light hover:bg-state-hover",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex flex-1 items-center justify-between gap-2">
        {item.label}
        {children}
      </span>
    </Link>
  );
}
