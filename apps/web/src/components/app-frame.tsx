'use client'

import { CommandMenu, type CommandItem } from '@saas/ui'
import { AppShell, MobileNav, NavRail, ProductMenu, TopBar } from '@saas/ui/shell'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState, type ReactNode } from 'react'
import { findModule, MODULES, productMenu, railGroups } from '@/navigation/config.tsx'
import { AppLink } from './link.tsx'
import { Logo } from './logo.tsx'
import { PreferencesMenu } from './preferences-menu.tsx'
import { WorkspaceProvider } from './workspace-context.tsx'
import { OrganizationSwitcher, UserMenu } from './workspace-menus.tsx'

export interface AppFrameProps {
  user: { id: string; memberId: string; name: string; email: string }
  organizations: { id: string; name: string }[]
  active: { id: string; name: string }
  permissions: string[]
  children: ReactNode
}

/** Application shell: TopBar + NavRail + ProductMenu + page, and the ⌘K command menu. */
export function AppFrame({ user, organizations, active, permissions, children }: AppFrameProps) {
  const t = useTranslations()
  const pathname = usePathname()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)

  const current = findModule(pathname)
  const groups = useMemo(() => railGroups(t), [t])
  const menu = useMemo(() => productMenu(current, t, permissions), [current, t, permissions])

  const commands: CommandItem[] = useMemo(
    () =>
      MODULES.flatMap((m) => {
        const group =
          m.railGroup === 1 ? t('shell.searchGroupSettings') : t('shell.searchGroupModules')
        const base: CommandItem = {
          id: m.key,
          label: t(`nav.${m.key}`),
          group,
          icon: m.icon,
          onSelect: () => router.push(m.href),
        }
        const sub = productMenu(m, t, permissions)?.sections.flatMap((s) =>
          s.items
            .filter((i) => i.href !== m.href)
            .map<CommandItem>((i) => ({
              id: `${m.key}.${i.key}`,
              label: `${t(`nav.${m.key}`)} › ${i.label}`,
              group,
              onSelect: () => router.push(i.href),
            })),
        )
        return [base, ...(sub ?? [])]
      }),
    [t, router, permissions],
  )

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-overlay focus:px-3 focus:py-2"
      >
        {t('shell.skipToContent')}
      </a>
      <AppShell
        topBar={
          <TopBar
            logo={<Logo name={t('app.name')} />}
            breadcrumbs={
              <>
                <OrganizationSwitcher organizations={organizations} active={active} />
                {current ? (
                  <>
                    <span aria-hidden className="text-foreground-muted">
                      /
                    </span>
                    <span className="truncate text-sm text-foreground-light">
                      {t(`nav.${current.key}`)}
                    </span>
                  </>
                ) : null}
              </>
            }
            searchLabel={t('shell.search')}
            onSearch={() => setSearchOpen(true)}
            actions={
              <>
                <PreferencesMenu />
                <UserMenu user={user} />
              </>
            }
            mobileMenu={
              <MobileNav
                groups={groups}
                activeKey={current?.key}
                productMenu={menu}
                activeHref={pathname}
                Link={AppLink}
                openLabel={t('shell.openMenu')}
                title={t('shell.mainNav')}
              />
            }
          />
        }
        rail={
          <NavRail
            groups={groups}
            activeKey={current?.key}
            Link={AppLink}
            label={t('shell.mainNav')}
          />
        }
        productMenu={
          menu ? <ProductMenu config={menu} activeHref={pathname} Link={AppLink} /> : undefined
        }
      >
        <WorkspaceProvider
          value={{
            organizationId: active.id,
            userId: user.id,
            memberId: user.memberId,
            permissions,
          }}
        >
          {children}
        </WorkspaceProvider>
      </AppShell>
      <CommandMenu
        open={searchOpen}
        onOpenChange={setSearchOpen}
        items={commands}
        placeholder={t('shell.searchPlaceholder')}
        emptyLabel={t('shell.searchEmpty')}
        title={t('shell.searchTitle')}
      />
    </>
  )
}
