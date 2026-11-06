import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface-200 px-1 font-mono text-[10px] text-foreground-lighter',
        className,
      )}
      {...props}
    />
  )
}
