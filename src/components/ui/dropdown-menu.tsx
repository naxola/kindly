"use client";

import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Menu of actions or navigation (header's organization/user menus). A
 * `destructive` item never runs its action directly — it opens a
 * `ConfirmDialog` instead (docs/ui/COMPONENTS.md).
 */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-(--z-popover) min-w-48 overflow-hidden rounded-card border border-border bg-surface-200 p-1 shadow-md",
          "data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { tone?: "default" | "destructive" }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 type-body outline-hidden select-none",
        "data-highlighted:bg-state-hover",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        tone === "destructive" ? "text-destructive-soft-foreground data-highlighted:bg-destructive-soft" : "text-foreground",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-foreground-lighter",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 pl-7 type-body text-foreground outline-hidden select-none",
        "data-highlighted:bg-state-hover data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <DropdownMenuPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center">
        <Check className="size-3.5" aria-hidden />
      </DropdownMenuPrimitive.ItemIndicator>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn("px-2 py-1.5 type-caption text-foreground-lighter", className)} {...props} />;
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
