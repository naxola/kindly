'use client'

import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Kbd } from '../components/kbd.tsx'

export function TopBar({
  logo,
  breadcrumbs,
  actions,
  mobileMenu,
  searchLabel,
  onSearch,
}: {
  logo: ReactNode
  breadcrumbs?: ReactNode
  actions?: ReactNode
  /** Menu button on small screens. */
  mobileMenu?: ReactNode
  searchLabel: string
  onSearch: () => void
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background-alt px-3">
      {mobileMenu ? <div className="md:hidden">{mobileMenu}</div> : null}
      <div className="flex shrink-0 items-center">{logo}</div>
      <span aria-hidden className="hidden text-foreground-muted sm:inline">
        /
      </span>
      <nav aria-label="breadcrumb" className="hidden min-w-0 items-center gap-1 sm:flex">
        {breadcrumbs}
      </nav>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onSearch}
        className="hidden h-[26px] w-56 items-center gap-2 rounded-md border border-border-control bg-control px-2 text-xs text-foreground-lighter hover:border-border-strong md:flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">{searchLabel}</span>
        <Kbd>⌘K</Kbd>
      </button>
      <div className="flex items-center gap-1">{actions}</div>
    </header>
  )
}
