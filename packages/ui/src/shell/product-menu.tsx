'use client'

import { cn } from '../lib/cn.ts'
import type { LinkComponent, ProductMenuConfig } from './types.ts'

/** Submenu of the active module. Its content changes with the section the user is in. */
export function ProductMenu({
  config,
  activeHref,
  Link,
  className,
  onNavigate,
}: {
  config: ProductMenuConfig
  activeHref?: string
  Link: LinkComponent
  className?: string
  onNavigate?: () => void
}) {
  return (
    <aside
      aria-label={config.title}
      className={cn(
        'hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-background md:flex',
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center border-b border-border px-5">
        <h2 className="truncate text-base text-foreground">{config.title}</h2>
      </div>
      <nav className="flex flex-col gap-4 px-3 py-4">
        {config.sections.map((section, si) => (
          <div key={si} className="flex flex-col gap-0.5">
            {section.title ? (
              <h3 className="px-2 pb-1 font-mono text-[11px] tracking-wider text-foreground-lighter uppercase">
                {section.title}
              </h3>
            ) : null}
            {section.items.map((item) => {
              const active = item.href === activeHref
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-8 items-center justify-between rounded-md px-2 text-sm transition-colors',
                    active
                      ? 'bg-selection text-foreground'
                      : 'text-foreground-light hover:bg-surface-200 hover:text-foreground',
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
