'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@saas/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown, LogOut, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/client/api.ts'
import { authRequest } from '@/client/auth.ts'

/** Active organization picker. Switching reloads every piece of data. */
export function OrganizationSwitcher({
  organizations,
  active,
}: {
  organizations: { id: string; name: string }[]
  active: { id: string; name: string }
}) {
  const t = useTranslations('orgSwitcher')
  const router = useRouter()
  const qc = useQueryClient()

  async function select(id: string) {
    if (id === active.id) return
    const res = await apiClient.PUT('/api/v1/me/organization', { body: { organizationId: id } })
    if (!res.response.ok) return
    // No data of the previous organization survives in the cache.
    qc.clear()
    router.push('/')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('label')}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-foreground hover:bg-surface-200"
      >
        <span className="truncate">{active.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-foreground-lighter" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
        {organizations.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => void select(o.id)}>
            <span className="flex-1 truncate">{o.name}</span>
            {o.id === active.id ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/onboarding?new=1')}>
          <Plus className="size-4" /> {t('create')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function UserMenu({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations('userMenu')
  const router = useRouter()
  const qc = useQueryClient()
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  async function signOut() {
    await authRequest('/sign-out', {})
    qc.clear()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('label')}
        className="flex size-7 items-center justify-center rounded-full border border-border-strong bg-surface-200 text-[11px] text-foreground hover:border-foreground-muted"
      >
        {initials || '?'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>
          <span className="block truncate text-foreground">{user.name}</span>
          <span className="block truncate font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="size-4" /> {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
