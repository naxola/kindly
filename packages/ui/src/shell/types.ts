import type { ComponentType, ReactNode } from 'react'

/** Link component injected by the app (e.g. next/link), so the UI is not coupled to Next. */
export type LinkComponent = ComponentType<{
  href: string
  className?: string
  children: ReactNode
  'aria-current'?: 'page' | undefined
  onClick?: () => void
}>

export interface RailItem {
  key: string
  label: string
  href: string
  icon: ReactNode
  badge?: number
}

export interface MenuItem {
  key: string
  label: string
  href: string
  badge?: ReactNode
}

export interface MenuSection {
  title?: string
  items: MenuItem[]
}

export interface ProductMenuConfig {
  title: string
  sections: MenuSection[]
}
