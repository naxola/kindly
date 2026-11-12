'use client'

import { cn } from '../lib/cn.ts'
import type { LinkComponent, RailItem } from './types.ts'

/**
 * Side icon bar. Collapsed (56 px) by default; it expands over the content on hover or
 * keyboard focus, as in Supabase Studio.
 */
export function NavRail({
  groups,
  activeKey,
  Link,
  label,
}: {
  groups: RailItem[][]
  activeKey?: string
  Link: LinkComponent
  label: string
}) {
  return (
    <div className="relative hidden w-14 shrink-0 md:block">
      <nav
        aria-label={label}
        className="group/rail absolute inset-y-0 left-0 z-30 flex w-14 flex-col gap-1 overflow-hidden border-r border-border bg-background-alt py-2 transition-[width] duration-150 hover:w-52 hover:shadow-xl focus-within:w-52 focus-within:shadow-xl"
      >
        {groups.map((items, gi) => (
          <ul
            key={gi}
            className={cn(
              'flex flex-col gap-0.5 px-2',
              gi > 0 && 'mt-auto border-t border-border pt-2',
            )}
          >
            {items.map((item) => {
              const active = item.key === activeKey
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-10 items-center gap-3 rounded-md px-2.5 text-sm whitespace-nowrap transition-colors',
                      active
                        ? 'bg-selection text-foreground'
                        : 'text-foreground-lighter hover:bg-surface-200 hover:text-foreground',
                    )}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-[18px]">
                      {item.icon}
                    </span>
                    <span className="flex-1 opacity-0 transition-opacity group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
                      {item.label}
                    </span>
                    {item.badge ? (
                      <span className="rounded-full bg-brand px-1.5 text-[10px] text-brand-foreground opacity-0 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        ))}
      </nav>
    </div>
  )
}
