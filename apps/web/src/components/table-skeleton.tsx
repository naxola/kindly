import { Skeleton } from '@saas/ui'

/** Rows of a table while it loads. Announces the loading state once, not per row. */
export function TableSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-2 rounded-lg border border-border p-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}
