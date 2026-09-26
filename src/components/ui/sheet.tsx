"use client";

import { Dialog as SheetPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Panel sliding in over the page (docs/ui/COMPONENTS.md, docs/ui/CHAT.md).
 * Modal by default: focus trap, `Esc`, backdrop click, focus returned to
 * the trigger on close — all from Radix's Dialog underneath (a Sheet is a
 * Dialog presented as a side panel, same primitive as shadcn/Supabase use).
 *
 * The conversation's anchored, non-modal mode (docs/ui/CHAT.md §4-5) is a
 * separate component built in UI-6: it drops the overlay and the focus
 * trap entirely, which this modal Sheet does not support via a prop.
 */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-(--z-overlay) bg-overlay",
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        className,
      )}
      {...props}
    />
  );
}

const sheetVariants = cva(
  "fixed z-(--z-modal) flex flex-col gap-0 border-border bg-surface-200 shadow-lg outline-hidden",
  {
    variants: {
      side: {
        left: "inset-y-0 left-0 h-full border-r data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left",
        right:
          "inset-y-0 right-0 h-full border-l data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right",
      },
      size: {
        sm: "w-full max-w-sheet-sm",
        md: "w-full max-w-sheet-md",
        lg: "w-full max-w-sheet-lg",
        full: "w-full",
      },
    },
    defaultVariants: { side: "right", size: "md" },
  },
);

export interface SheetContentProps
  extends React.ComponentProps<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Hides the built-in close button when the header provides its own. */
  showClose?: boolean;
}

export function SheetContent({ className, side, size, showClose = true, children, ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetOverlay />
      <SheetPrimitive.Content className={cn(sheetVariants({ side, size }), className)} {...props}>
        {children}
        {showClose && (
          <SheetPrimitive.Close className="absolute top-3 right-3 rounded-sm p-1 text-foreground-lighter focus-ring hover:bg-state-hover hover:text-foreground">
            <X className="size-4" aria-hidden />
            <span className="sr-only">Cerrar</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 border-b border-border px-4 py-3", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("type-section-title text-foreground", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn("type-body text-foreground-lighter", className)} {...props} />;
}

/** Scrolls independently of the header/footer, which stay put. */
export function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-y-auto px-4 py-4", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3", className)}
      {...props}
    />
  );
}
