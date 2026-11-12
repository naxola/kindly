import { cn } from '../lib/cn.ts'

/**
 * Horizontal meter (0–100). The tone changes as it fills: brand, then warning from 80 %,
 * destructive at 100 %. `label` is the accessible name.
 */
export function Progress({
  value,
  label,
  className,
}: {
  value: number
  label: string
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  const tone = value >= 100 ? 'bg-destructive' : value >= 80 ? 'bg-warning' : 'bg-brand'
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-300', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width]', tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
