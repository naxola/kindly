"use client";

import { Toaster as SonnerToaster, toast } from "sonner";

/**
 * Non-blocking feedback, or feedback about a surface that's no longer
 * visible (docs/ui/COMPONENTS.md). Form submission errors do **not** go
 * here — they show inline, next to the action (`Field`'s `error`,
 * `ConfirmDialog`'s inline error). `toast.error` announces `assertive`;
 * everything else `polite` — both are Sonner defaults, not configured here.
 *
 * `unstyled` + `classNames` replaces every visual Sonner ships with our own
 * tokens, since its built-ins are hardcoded greys, not our palette.
 */
export { toast };

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-(--width) items-start gap-3 rounded-card border border-border bg-surface-200 px-4 py-3 shadow-lg type-body text-foreground",
          title: "type-label text-foreground",
          description: "type-caption text-foreground-lighter",
          actionButton: "ml-auto shrink-0 rounded-control bg-primary px-2.5 py-1 type-caption font-medium text-primary-foreground",
          cancelButton: "shrink-0 rounded-control bg-background-muted px-2.5 py-1 type-caption text-foreground-light",
          success: "border-success-border",
          error: "border-destructive-border",
          warning: "border-warning-border",
          info: "border-info-border",
        },
      }}
    />
  );
}
