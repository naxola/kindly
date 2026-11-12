import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Search + filters + actions on one row (docs/ui/COMPONENTS.md;
 * docs/ui/LAYOUT_NAVIGATION.md §5, "acciones donde ya miras"). A layout
 * component, not a data-driven filter engine — Kindly's filters are a
 * handful of selects/segments per page, not compound query builders.
 */
export function FilterBar({
  search,
  filters,
  actions,
  className,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {search && <div className="w-full sm:max-w-64">{search}</div>}
        {filters}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
