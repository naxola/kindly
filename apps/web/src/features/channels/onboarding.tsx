'use client'

import { Button, Callout, Checkbox, EmptyState, Field, Input } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Cable } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { channelKeys, useChannels } from './queries.ts'

/** The channel must exist here and declare the guided onboarding; otherwise there is nothing to walk. */
function useGuidedChannel(channel: string) {
  const orgId = useOrganizationId()
  const channels = useChannels(orgId)
  const found = channels.data?.channels.find((c) => c.channel === channel)
  return {
    data: channels.data,
    pending: channels.isPending,
    guided: found?.onboarding === 'WHATSAPP_COEXISTENCE',
  }
}

function NotFound() {
  const t = useTranslations('channels.onboarding')
  return (
    <PageContainer size="medium">
      <EmptyState
        icon={<Cable />}
        title={t('notFound')}
        action={
          <Button asChild>
            <Link href="/settings/channels">{t('back')}</Link>
          </Button>
        }
      />
    </PageContainer>
  )
}

/**
 * Step 1: choosing one of the mutually exclusive ways in. The unavailable ones are shown, disabled,
 * with the reason: the delegate should know the option exists and is not ready.
 */
export function OnboardingPaths({ channel }: { channel: string }) {
  const t = useTranslations('channels.onboarding')
  const { data, pending, guided } = useGuidedChannel(channel)
  if (pending) return null
  if (!guided || !data) return <NotFound />
  return (
    <>
      <PageHeader
        title={
          <>
            <Link
              href="/settings/channels"
              className="mb-1 block text-sm text-foreground-lighter hover:underline"
            >
              {t('back')}
            </Link>
            {t('pathsTitle')}
          </>
        }
        description={t('pathsDescription')}
      />
      <PageContainer size="medium">
        <ul className="space-y-3">
          {data.onboarding.paths.map((p) => (
            <li
              key={p.id}
              className={
                p.available
                  ? 'rounded-lg border border-border p-4'
                  : 'rounded-lg border border-border bg-surface-100 p-4 text-foreground-lighter'
              }
            >
              <p className="text-sm text-foreground">{t(`paths.${p.id}.title`)}</p>
              <p className="mt-1 text-sm">{t(`paths.${p.id}.description`)}</p>
              {p.available ? (
                <Button asChild variant="primary" className="mt-3">
                  <Link href={`/settings/channels/connect/${channel}/coexistence`}>
                    {t('next')}
                  </Link>
                </Button>
              ) : (
                <p className="mt-3 text-xs">
                  <span className="font-medium">{t('unavailable')}</span>{' '}
                  {t(`paths.${p.id}.unavailable`)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </PageContainer>
    </>
  )
}

/**
 * Step 2: everything the delegate must know before the connection starts, because afterwards some
 * of it cannot be undone from Kindly. The button stays disabled until every point is ticked; the
 * server checks them all again (a disabled button is a courtesy, not a guarantee).
 */
export function CoexistenceChecklist({ channel }: { channel: string }) {
  const t = useTranslations('channels.onboarding')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const router = useRouter()
  const { data, pending, guided } = useGuidedChannel(channel)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [country, setCountry] = useState('')

  const connect = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/v1/channels/accounts/onboarding', {
          body: {
            channel,
            path: 'COEXISTENCE',
            acknowledged: Object.entries(ticked)
              .filter(([, on]) => on)
              .map(([id]) => id),
            countryCode: country.trim() || null,
          },
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: channelKeys.all(orgId) })
      router.push('/settings/channels')
    },
  })

  if (pending) return null
  if (!guided || !data) return <NotFound />
  const countryCheck = data.onboarding.countryCheckAvailable
  const ready =
    data.onboarding.checks.every((id) => ticked[id]) &&
    (!countryCheck || country.trim().length === 2)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (ready) connect.mutate()
  }

  return (
    <>
      <PageHeader
        title={
          <>
            <Link
              href={`/settings/channels/connect/${channel}`}
              className="mb-1 block text-sm text-foreground-lighter hover:underline"
            >
              {t('preflightBack')}
            </Link>
            {t('preflightTitle')}
          </>
        }
        description={t('preflightDescription')}
      />
      <PageContainer size="medium">
        <form onSubmit={onSubmit} className="space-y-4">
          {connect.error ? (
            <Callout variant="destructive" title={t('connectFailed')}>
              {errorText(all, connect.error)}
            </Callout>
          ) : null}
          <ul className="space-y-3">
            {data.onboarding.checks.map((id) => (
              <li key={id} className="rounded-lg border border-border p-3">
                <Checkbox
                  checked={!!ticked[id]}
                  onChange={(e) => setTicked((s) => ({ ...s, [id]: e.target.checked }))}
                  label={t(`checks.${id}.title`)}
                  description={t(`checks.${id}.detail`)}
                />
              </li>
            ))}
          </ul>
          <div className="rounded-lg border border-border p-3">
            {countryCheck ? (
              <Field label={t('country')} hint={t('countryHint')}>
                {(p) => (
                  <Input
                    {...p}
                    className="w-24 uppercase"
                    placeholder="ES"
                    maxLength={2}
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                )}
              </Field>
            ) : (
              <>
                <p className="text-sm text-foreground">{t('country')}</p>
                <p className="mt-1 text-xs text-foreground-lighter">{t('countryUnknown')}</p>
              </>
            )}
          </div>
          <Callout variant="info" title={t('whatNext')}>
            {t('whatNextBody')}
          </Callout>
          <Button type="submit" variant="primary" disabled={!ready || connect.isPending}>
            {t('continue')}
          </Button>
        </form>
      </PageContainer>
    </>
  )
}
