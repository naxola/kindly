import type { ReactNode } from 'react'

/**
 * Application layout (ADR 0007):
 *   TopBar
 *   NavRail | ProductMenu | page
 */
export function AppShell({
  topBar,
  rail,
  productMenu,
  children,
}: {
  topBar: ReactNode
  rail: ReactNode
  productMenu?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      {topBar}
      <div className="flex min-h-0 flex-1">
        {rail}
        {productMenu}
        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
