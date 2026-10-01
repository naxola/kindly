"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

/** Compound filters, small selectors — anything that needs a form, not just a list of items (that's `DropdownMenu`). */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = "start",
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-(--z-popover) w-72 rounded-card border border-border bg-surface-200 p-3 shadow-md outline-hidden",
          "data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
