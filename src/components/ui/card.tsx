import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Bordered container at the page's level (surface-100). Groups related
 * content or a form section; not a decoration around everything.
 * Supabase's pattern: settings forms are Cards inside PageSections, with the
 * actions in CardFooter.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-card border border-border bg-surface-100 text-foreground shadow-xs", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 border-b border-border px-4 py-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("type-section-title text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("type-body text-foreground-lighter", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-4 px-4 py-4", className)} {...props} />;
}

/** Actions row. Primary action last (rightmost), as in dialogs. */
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 rounded-b-card border-t border-border bg-background-muted px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}
