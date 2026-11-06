import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/** Data table in the shell style. Large tables will use TanStack Table. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function THead(props: ComponentProps<'thead'>) {
  return <thead className="bg-surface-100 text-left text-xs text-foreground-lighter" {...props} />
}

export function TBody(props: ComponentProps<'tbody'>) {
  return <tbody className="divide-y divide-border" {...props} />
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('hover:bg-surface-100/60', className)} {...props} />
}

export function TH({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('px-3 py-2 font-normal', className)} {...props} />
}

export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2 align-middle text-foreground', className)} {...props} />
}
