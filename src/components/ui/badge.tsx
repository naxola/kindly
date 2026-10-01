import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Short status label. Colour is never the only signal: the text itself must
 * say the state ("Sin identificar", "Con error"), the tone only reinforces it.
 */
export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-px type-caption font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-background-muted text-foreground-light",
        primary: "border-primary-border bg-primary-soft text-primary-soft-foreground",
        success: "border-success-border bg-success-soft text-success-soft-foreground",
        warning: "border-warning-border bg-warning-soft text-warning-soft-foreground",
        destructive: "border-destructive-border bg-destructive-soft text-destructive-soft-foreground",
        info: "border-info-border bg-info-soft text-info-soft-foreground",
        outline: "border-border-strong bg-transparent text-foreground-light",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

const DOT_TONES = {
  neutral: "bg-foreground-lighter",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
  outline: "bg-foreground-lighter",
} as const;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Adds a small leading dot in the tone's solid colour. */
  dot?: boolean;
}

export function Badge({ className, tone, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", DOT_TONES[tone ?? "neutral"])} />}
      {children}
    </span>
  );
}

/**
 * Numeric counter (unread messages, pending items). Announces the number
 * with its meaning via `label`, since "3" alone means nothing to a screen
 * reader.
 */
export function CountBadge({ count, label, className }: { count: number; label: string; className?: string }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 type-caption font-semibold text-primary-foreground tabular-nums",
        className,
      )}
    >
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{`${count} ${label}`}</span>
    </span>
  );
}
