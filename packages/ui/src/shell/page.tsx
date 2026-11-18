import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5 lg:px-10">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl text-foreground">{title}</h1>
        {description ? <p className="text-sm text-foreground-lighter">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function PageContainer({
  children,
  size = 'large',
  className,
}: {
  children: ReactNode
  size?: 'medium' | 'large' | 'full'
  className?: string
}) {
  const max = { medium: 'max-w-4xl', large: 'max-w-7xl', full: 'max-w-none' }[size]
  return <div className={cn('mx-auto w-full px-6 py-6 lg:px-10', max, className)}>{children}</div>
}
