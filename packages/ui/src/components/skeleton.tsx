import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/** Placeholder block while content loads. Decorative: hidden from assistive technology. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-300', className)}
      {...props}
    />
  )
}
