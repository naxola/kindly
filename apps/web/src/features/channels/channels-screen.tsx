'use client'

import { Badge, Button, Callout, ConfirmDialog, EmptyState } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Cable } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { useCan, useMemberId, useOrganizationId } from '@/components/workspace-context.tsx'
import { channelKeys, useChannels, type ChannelAccount } from './queries.ts'

const TONE_TO_BADGE = {
  ok: 'success',
  pending: 'default',
  warning: 'warning',
  error: 'destructive',
  inactive: 'default',
} as const

/**
 * Channels: each person's own messaging accounts, how to connect another, and (for whoever can see
 * every account) the rest of the organization's. Connecting is always for oneself: every provider
 * authenticates the account holder in person.
 */
export function ChannelsScreen() {
  const t = useTranslations('channels')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const memberId = useMemberId()
  const canSeeAll = useCan()('channels.read_all')
  const canConnect = useCan()('channels.connect')
  const qc = useQueryClient()
  const channels = useChannels(orgId)
  const [disconnecting, setDisconnecting] = useState<ChannelAccount | null>(null)

  const connect = useMutation({
    mutationFn: async (channel: string) =>
      unwrap(await apiClient.POST('/api/v1/channels/accounts', { body: { channel } })),
    onSettled: () => qc.invalidateQueries({ queryKey: channelKeys.all(orgId) }),
  })
  const disconnect = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await apiClient.POST('/api/v1/channels/accounts/{id}/disconnect', {
          params: { path: { id } },
        }),
      ),
    onSettled: async () => {
      setDisconnecting(null)
      await qc.invalidateQueries({ queryKey: channelKeys.all(orgId) })
    },
  })

  const data = channels.data
  const mine = (data?.accounts ?? []).filter((a) => a.delegateId === memberId)
  const others = (data?.accounts ?? []).filter((a) => a.delegateId !== memberId)
  const connected = new Set(mine.filter((a) => a.status !== 'DISCONNECTED').map((a) => a.channel))
  const error = connect.error ?? disconnect.error ?? channels.error

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <PageContainer size="medium" className="space-y-8">
        {error ? <Callout variant="destructive">{errorText(all, error)}</Callout> : null}

        <section className="space-y-3">
          <h2 className="text-base">{t('mine')}</h2>
          {mine.length === 0 && !channels.isPending ? (
            <p className="text-sm text-foreground-lighter">{t('noneMine')}</p>
          ) : (
            <ul className="space-y-3" aria-label={t('mine')}>
              {mine.map((a) => (
                <AccountCard key={a.id} account={a} own onDisconnect={setDisconnecting} />
              ))}
            </ul>
          )}
        </section>

        {canConnect ? (
          <section className="space-y-3">
            <h2 className="text-base">{t('connect')}</h2>
            {(data?.channels ?? []).length === 0 && !channels.isPending ? (
              <EmptyState icon={<Cable />} title={t('noChannels')} />
            ) : (
              <ul className="space-y-2">
                {(data?.channels ?? []).map((c) => {
                  const already = connected.has(c.channel)
                  return (
                    <li
                      key={c.channel}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                    >
                      <div>
                        <p className="text-sm text-foreground">{c.channel}</p>
                        <p className="text-xs text-foreground-lighter">
                          {already ? t('alreadyConnected') : t('willConnect')}
                        </p>
                      </div>
                      {already ? null : c.onboarding === 'DIRECT' ? (
                        <Button
                          variant="primary"
                          disabled={connect.isPending}
                          onClick={() => connect.mutate(c.channel)}
                        >
                          {t('connectButton', { channel: c.channel })}
                        </Button>
                      ) : (
                        <Button asChild variant="primary">
                          <Link href={`/settings/channels/connect/${c.channel}`}>
                            {t('connectButton', { channel: c.channel })}
                          </Link>
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ) : null}

        {canSeeAll ? (
          <section className="space-y-3">
            <h2 className="text-base">{t('others')}</h2>
            {others.length === 0 && !channels.isPending ? (
              <p className="text-sm text-foreground-lighter">{t('noneOthers')}</p>
            ) : (
              <ul className="space-y-3" aria-label={t('others')}>
                {others.map((a) => (
                  <AccountCard key={a.id} account={a} onDisconnect={setDisconnecting} />
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </PageContainer>
      <ConfirmDialog
        open={!!disconnecting}
        onOpenChange={(open) => {
          if (!open) setDisconnecting(null)
        }}
        title={t('disconnectTitle')}
        description={t('disconnectDescription')}
        confirmLabel={t('disconnect')}
        cancelLabel={all('common.cancel')}
        variant="destructive"
        loading={disconnect.isPending}
        onConfirm={() => {
          if (disconnecting) disconnect.mutate(disconnecting.id)
        }}
      />
    </>
  )
}

function AccountCard({
  account: a,
  own = false,
  onDisconnect,
}: {
  account: ChannelAccount
  own?: boolean
  onDisconnect: (a: ChannelAccount) => void
}) {
  const t = useTranslations('channels')
  const format = useFormatter()
  return (
    <li className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground">
            {a.displayName ?? a.channel}
            {!own ? <span className="text-foreground-lighter"> · {a.delegateName}</span> : null}
          </p>
          <p className="text-xs text-foreground-lighter">
            {a.channel}
            {a.phone ? ` · ${a.phone}` : ''}
          </p>
        </div>
        <Badge variant={TONE_TO_BADGE[a.tone]} className="shrink-0">
          {t(`status.${a.status}.label`)}
          {a.needsAttention ? ` · ${t('attention')}` : ''}
        </Badge>
      </div>
      <p className="text-sm text-foreground-light">{t(`status.${a.status}.detail`)}</p>
      {a.webhookPath ? (
        <p className="text-xs text-foreground-lighter">
          {t('webhook')}: <code className="break-all font-mono">{a.webhookPath}</code>
        </p>
      ) : null}
      {a.lastError ? (
        <p className="text-xs text-destructive">
          <span className="font-medium">{t('lastError')}:</span> {a.lastError}
        </p>
      ) : null}
      <p className="text-xs text-foreground-lighter">
        {a.connectedAt
          ? `${t('connectedOn', { date: format.dateTime(new Date(a.connectedAt), { dateStyle: 'medium' }) })} `
          : ''}
        {a.lastSyncAt
          ? t('lastSync', {
              date: format.dateTime(new Date(a.lastSyncAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })
          : t('noSync')}
      </p>
      {a.status !== 'DISCONNECTED' ? (
        a.canDisconnect ? (
          <Button onClick={() => onDisconnect(a)}>{t('disconnect')}</Button>
        ) : (
          <p className="text-xs text-foreground-lighter">
            {own ? t('deviceOnlyOwn') : t('deviceOnlyOther')}
          </p>
        )
      ) : null}
    </li>
  )
}
