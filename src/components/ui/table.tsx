import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Presentational table (docs/ui/COMPONENTS.md §4): static, read-mostly data
 * with no sort/filter/pagination of its own. Reach for a `DataTable` pattern
 * (TanStack, per-use-case) only once a listing genuinely needs those.
 */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className={cn("w-full border-collapse type-body", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-background-muted", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export interface TableRowProps extends Omit<HTMLAttributes<HTMLTableRowElement>, "onClick"> {
  /** Adds hover, focus and keyboard activation (Enter/Space) to the whole row. */
  interactive?: boolean;
  /** Skipped when the click originated on a nested control (button, link, input). */
  onActivate?: () => void;
}

export function TableRow({ className, interactive = false, onActivate, tabIndex, ...props }: TableRowProps) {
  return (
    <tr
      tabIndex={interactive ? (tabIndex ?? 0) : tabIndex}
      onClick={
        onActivate
          ? (event) => {
              const target = event.target as HTMLElement;
              if (!target.closest("button, a, input, select, textarea, [role='button']")) {
                onActivate();
              }
            }
          : undefined
      }
      onKeyDown={
        interactive && onActivate
          ? (event) => {
              if (event.currentTarget !== event.target) {
                return; // A focused nested control handles its own Enter/Space.
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
      className={cn(
        "border-b border-border last:border-0",
        interactive && "relative cursor-pointer hover:bg-state-hover focus-inset",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn("px-3 py-2 text-left type-label font-medium text-foreground-light", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 align-middle", className)} {...props} />;
}

/** A single full-width row for "no data" or "no results" (docs/ui/PRINCIPLES.md §5). */
export function TableEmpty({
  colSpan,
  title,
  description,
  action,
}: {
  colSpan: number;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState variant="inline" title={title} description={description} action={action} />
      </td>
    </tr>
  );
}
