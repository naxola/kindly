import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Small presentational building blocks with no variants of their own. */

export function Separator({
  orientation = "horizontal",
  decorative = true,
  className,
}: {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
  className?: string;
}) {
  return (
    <div
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    />
  );
}

/**
 * Loading placeholder shaped like the content it replaces, so the layout
 * does not jump when data arrives. Pair a group of skeletons with one
 * `aria-busy` container and a visually hidden label ("Cargando conversaciones").
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-300", className)} {...props} />;
}

/** Keyboard key hint ("⌘K", "Intro"). */
export function Kbd({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border-strong bg-background-muted px-1 font-sans text-2xs font-medium text-foreground-light",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

const AVATAR_SIZES = {
  sm: "size-6 text-2xs",
  md: "size-8 type-caption",
  lg: "size-10 type-body",
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Initials avatar. Decorative: the name is always rendered as text next to
 * it, so the avatar itself is hidden from assistive technology.
 */
export function Avatar({
  name,
  size = "md",
  className,
  badge,
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
  /** Small overlay in the corner (e.g. the channel icon). */
  badge?: ReactNode;
}) {
  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-surface-300 font-semibold text-foreground-light",
          AVATAR_SIZES[size],
        )}
      >
        {initials(name)}
      </span>
      {badge && (
        <span className="absolute -right-0.5 -bottom-0.5 inline-flex rounded-full bg-background p-px">{badge}</span>
      )}
    </span>
  );
}
