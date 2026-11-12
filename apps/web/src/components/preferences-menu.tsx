'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@saas/ui'
import { SlidersHorizontal } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales.ts'

/** Interface preferences (theme and language), kept in this browser. */
export function PreferencesMenu() {
  const t = useTranslations('shell')
  const locale = useLocale()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const setLocale = (value: string) => {
    if (!isLocale(value)) return
    document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('preferences')}
        className="rounded-md p-1.5 text-foreground-light hover:bg-surface-200 hover:text-foreground"
      >
        <SlidersHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('theme')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">{t('themeLight')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t('themeDark')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{t('themeSystem')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={setLocale}>
          <DropdownMenuRadioItem value="es">Español</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
