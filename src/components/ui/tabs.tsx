"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

/**
 * Tabbed sub-views that stay in local state (docs/ui/COMPONENTS.md §4). If
 * switching the view should change the URL, use `ContextNav` (links) —
 * Tabs are for content that does not deserve its own address.
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-1 border-b border-border", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px border-b-2 border-transparent px-3 py-2 type-label text-foreground-light",
        "hover:text-foreground",
        "data-[state=active]:border-primary data-[state=active]:text-foreground",
        "focus-ring disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-4 focus-ring", className)} {...props} />;
}
