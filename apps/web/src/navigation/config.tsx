import type { Permission } from '@saas/core'
import type { ProductMenuConfig, RailItem } from '@saas/ui/shell'
import { BookOpen, House, Inbox, ListChecks, Settings, Users } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Declarative navigation. Each product adds its modules here; each item can list the
 * permissions that show it (`anyOf`). It only filters navigation: the API rejects anyway
 * what the person cannot do.
 */
type T = (key: string) => string

export interface ModuleDef {
  key: string
  href: string
  icon: ReactNode
  /** Rail group: 0 = modules, 1 = settings (bottom). */
  railGroup: 0 | 1
  menu?: {
    titleKey: string
    sections: { titleKey?: string; items: { key: string; path: string; anyOf?: Permission[] }[] }[]
  }
}

export const MODULES: ModuleDef[] = [
  { key: 'home', href: '/', icon: <House />, railGroup: 0 },
  { key: 'inbox', href: '/inbox', icon: <Inbox />, railGroup: 0 },
  { key: 'contacts', href: '/contacts', icon: <Users />, railGroup: 0 },
  { key: 'tasks', href: '/tasks', icon: <ListChecks />, railGroup: 0 },
  { key: 'knowledge', href: '/knowledge', icon: <BookOpen />, railGroup: 0 },
  {
    key: 'settings',
    href: '/settings',
    icon: <Settings />,
    railGroup: 1,
    menu: {
      titleKey: 'menu.settings.title',
      sections: [
        {
          items: [
            { key: 'members', path: 'members', anyOf: ['members.read'] },
            { key: 'positions', path: 'positions', anyOf: ['members.read'] },
            { key: 'channels', path: 'channels', anyOf: ['channels.read'] },
            { key: 'billing', path: 'billing', anyOf: ['billing.read'] },
          ],
        },
      ],
    },
  },
]

const join = (base: string, path: string) => (path ? `${base}/${path}` : base)

export function findModule(pathname: string): ModuleDef | undefined {
  if (pathname === '/') return MODULES[0]
  return MODULES.find(
    (m) => m.href !== '/' && (pathname === m.href || pathname.startsWith(`${m.href}/`)),
  )
}

export function railGroups(t: T): RailItem[][] {
  const toItem = (m: ModuleDef): RailItem => ({
    key: m.key,
    label: t(`nav.${m.key}`),
    href: m.href,
    icon: m.icon,
  })
  return [
    MODULES.filter((m) => m.railGroup === 0).map(toItem),
    MODULES.filter((m) => m.railGroup === 1).map(toItem),
  ]
}

/** Module menu. With `permissions`, hides the items the person cannot use. */
export function productMenu(
  mod: ModuleDef | undefined,
  t: T,
  permissions?: readonly string[],
): ProductMenuConfig | undefined {
  if (!mod?.menu) return undefined
  const visible = (anyOf?: Permission[]) =>
    !permissions || !anyOf || anyOf.some((p) => permissions.includes(p))
  return {
    title: t(mod.menu.titleKey),
    sections: mod.menu.sections
      .map((s) => ({
        ...(s.titleKey ? { title: t(s.titleKey) } : {}),
        items: s.items
          .filter((i) => visible(i.anyOf))
          .map((i) => ({
            key: i.key,
            label: t(`menu.${mod.key}.${i.key}`),
            href: join(mod.href, i.path),
          })),
      }))
      .filter((s) => s.items.length > 0),
  }
}
