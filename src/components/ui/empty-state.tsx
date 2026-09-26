import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * "Nothing here" — and what to do about it (docs/ui/PRINCIPLES.md §5).
 *
 * - `presentational`: first-time empty module, centred, with the action
 *   that fills it ("Todavía no hay contactos" + "Crear contacto").
 * - `inline`: inside a list or table that normally has rows, same footprint
 *   as a row so the layout does not jump; also used for "zero results"
 *   after a search or filter, which must say so and offer to clear it.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  variant = "presentational",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  variant?: "presentational" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <div className={cn("flex flex-col items-center gap-1 px-4 py-8 text-center", className)}>
        <p className="type-label text-foreground-light">{title}</p>
        {description && <p className="type-caption text-foreground-lighter">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-card border border-dashed border-border-strong px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-background-muted text-foreground-lighter [&_svg]:size-5"
        >
          {icon}
        </span>
      )}
      <p className="type-section-title text-foreground">{title}</p>
      {description && <p className="max-w-sm type-body text-foreground-lighter">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
