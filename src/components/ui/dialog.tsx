"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Centered modal for a short, focused task (docs/ui/COMPONENTS.md). Use
 * `Sheet` instead for a form with more than a few fields or a detailed view
 * (docs/ui/COMPONENTS.md §4). Focus trap, `Esc`, backdrop click and focus
 * return to the trigger all come from Radix's Dialog underneath — the same
 * primitive `Sheet` wraps, just centered instead of docked to an edge.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-(--z-overlay) bg-overlay",
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        className,
      )}
      {...props}
    />
  );
}

const dialogContentVariants = cva(
  [
    "fixed top-1/2 left-1/2 z-(--z-modal) flex max-h-[calc(100dvh-2rem)] w-[calc(100dvw-2rem)]",
    "-translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-y-auto rounded-overlay border border-border",
    "bg-surface-200 shadow-lg outline-hidden",
    "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
  ],
  {
    variants: {
      size: {
        sm: "sm:max-w-dialog-sm",
        md: "sm:max-w-dialog-md",
        lg: "sm:max-w-dialog-lg",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  showClose?: boolean;
}

export function DialogContent({ className, size, showClose = true, children, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content className={cn(dialogContentVariants({ size }), className)} {...props}>
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute top-3 right-3 rounded-sm p-1 text-foreground-lighter focus-ring hover:bg-state-hover hover:text-foreground">
            <X className="size-4" aria-hidden />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 border-b border-border px-4 py-3", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("type-section-title text-foreground", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("type-body text-foreground-lighter", className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-3 px-4 py-4", className)} {...props} />;
}

/** Primary action last (rightmost), same order as everywhere else. */
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3", className)}
      {...props}
    />
  );
}
