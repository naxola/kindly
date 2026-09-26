"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

/**
 * A one-sentence explanation, shown on hover/focus. Never load-bearing
 * content: what it explains must also work without it (the collapsed
 * sidebar keeps `aria-label` on the link itself — docs/ui/ACCESSIBILITY.md).
 */
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-(--z-tooltip) rounded-sm bg-foreground px-2 py-1 type-caption text-foreground-inverse shadow-sm",
          "data-[state=delayed-open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
