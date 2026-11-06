import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { cn } from '../lib/cn.ts'

/** Form field: label, control, hint and error linked by id (accessible). */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: (props: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }) => ReactNode
  className?: string
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-xs text-foreground-light">
        {label}
      </label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-foreground-lighter">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full rounded-md border border-border-control bg-control px-2 text-sm text-foreground disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; description?: ReactNode }) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-border-control accent-brand disabled:opacity-50"
        {...props}
      />
      <label htmlFor={id} className="space-y-0.5 text-sm text-foreground">
        <span className="block">{label}</span>
        {description ? (
          <span className="block text-xs text-foreground-lighter">{description}</span>
        ) : null}
      </label>
    </div>
  )
}

const calloutStyles = {
  info: 'border-border-strong bg-surface-100 text-foreground-light',
  success: 'border-success/40 bg-success-subtle text-foreground',
  warning: 'border-warning/40 bg-warning-subtle text-foreground',
  destructive: 'border-destructive/40 bg-destructive-subtle text-foreground',
}

/** Inline notice (form errors, states, warnings). */
export function Callout({
  variant = 'info',
  title,
  children,
  className,
}: {
  variant?: keyof typeof calloutStyles
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn('rounded-md border px-3 py-2 text-sm', calloutStyles[variant], className)}
    >
      {title ? <p className="text-foreground">{title}</p> : null}
      {children ? <div className="text-foreground-light">{children}</div> : null}
    </div>
  )
}

/** Bordered block (settings sections, form cards). */
export function Panel({
  title,
  description,
  footer,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-lg border border-border bg-surface-100', className)}>
      {title ? (
        <header className="space-y-0.5 border-b border-border px-5 py-3">
          <h2 className="text-sm text-foreground">{title}</h2>
          {description ? <p className="text-xs text-foreground-lighter">{description}</p> : null}
        </header>
      ) : null}
      <div className="px-5 py-4">{children}</div>
      {footer ? (
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full resize-y rounded-md border border-border-control bg-control px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
