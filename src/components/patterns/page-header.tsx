import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Page title block (docs/ui/LAYOUT_NAVIGATION.md §5): the name of the thing
 * ("Contactos", "Ada Lovelace"), never an instruction, with a declarative
 * description (no trailing period) and page-level actions in `aside` —
 * only when there is no filter row to put them in instead.
 */
export function PageHeader({
  title,
  description,
  icon,
  aside,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span aria-hidden className="mt-0.5 shrink-0 text-foreground-lighter [&_svg]:size-5">
            {icon}
          </span>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="type-page-title text-foreground">{title}</h1>
          {description && <p className="type-body text-foreground-lighter">{description}</p>}
        </div>
      </div>
      {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}
