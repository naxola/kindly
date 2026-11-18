import type { ReactNode } from 'react'

/** Container of the access screens (sign-in, sign-up, recovery…). */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl text-foreground">{title}</h1>
        {description ? <p className="text-sm text-foreground-lighter">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="text-sm text-foreground-lighter">{footer}</div> : null}
    </div>
  )
}
