import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-100 px-6 py-14 text-center">
      {icon ? <div className="text-foreground-lighter [&_svg]:size-6">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm text-foreground">{title}</p>
        {description ? (
          <p className="max-w-md text-sm text-foreground-lighter">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
