import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-8 w-full rounded-md border border-border-control bg-control px-3 text-sm text-foreground placeholder:text-foreground-muted disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-xs text-foreground-light', className)} {...props} />
}
