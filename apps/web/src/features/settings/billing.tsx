'use client'

import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Field,
  Input,
  Panel,
  Progress,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { Gauge } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { openPaddleCheckout } from '@/client/paddle.ts'
import {
  billingKeys,
  useBillingOverview,
  useBillingPeriods,
  useBillingPlans,
} from '@/client/queries.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'

type Overview = NonNullable<ReturnType<typeof useBillingOverview>['data']>
type Metric = Overview['metrics'][number]

const PERIOD_VARIANT = {
  NO_CHARGE: 'default',
  PENDING_CHARGE: 'warning',
  CHARGED: 'success',
  CHARGE_FAILED: 'destructive',
} as const

const STATUS_VARIANT = {
  DEFAULT: 'default',
  TRIALING: 'brand',
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  CANCELED: 'default',
} as const

/** Plan, period and usage of the active organization (ADR 0012). Plan changes arrive with B3. */
export function BillingSettings() {
  const t = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const overview = useBillingOverview(orgId)
  const o = overview.data
  const subscribed = Boolean(o && o.status !== 'DEFAULT')
  const periods = useBillingPeriods(orgId, subscribed)
  const canManage = useCan()('billing.manage')
  const hasOverage = Boolean(o?.metrics.some((m) => m.limit === 'soft' && m.included !== null))
  const canBuy = Boolean(o?.paymentsEnabled && canManage && !subscribed)
  const plans = useBillingPlans(orgId, canBuy)
  const paidPlans = (plans.data ?? []).filter((p) => Number(p.price) > 0)
  const checkout = useMutation({
    mutationFn: async (plan: string) => {
      const session = unwrap(await apiClient.POST('/api/v1/billing/checkout', { body: { plan } }))
      await openPaddleCheckout(session)
    },
  })
  const portal = useMutation({
    mutationFn: async () => {
      const { url } = unwrap(await apiClient.POST('/api/v1/billing/portal'))
      window.location.assign(url)
    },
  })
  const actionError = checkout.error ?? portal.error

  // Product texts: plan and metric names come from messages; unknown keys show the raw key.
  const tr = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback)
  const money = (amount: string, currency: string) =>
    format.number(Number(amount), { style: 'currency', currency })
  const qty = (value: string) => format.number(Number(value), { maximumFractionDigits: 3 })

  const limitText = (m: Metric, currency: string) =>
    m.included === null
      ? t('settings.billing.unlimited')
      : m.limit === 'hard'
        ? t('settings.billing.hardLimit')
        : t('settings.billing.overage', {
            price: money(m.overagePrice ?? '0', currency),
            unit: tr(`billing.units.${m.unit}`, m.unit),
          })

  return (
    <>
      <PageHeader
        title={t('settings.billing.title')}
        description={t('settings.billing.description')}
      />
      <PageContainer>
        {overview.error ? (
          <Callout variant="destructive">{errorText(t, overview.error)}</Callout>
        ) : null}
        {o ? (
          <div className="space-y-6">
            <Panel title={t('settings.billing.plan')}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-base text-foreground">
                      {tr(`billing.plans.${o.plan.key}`, o.plan.key)}
                    </p>
                    <Badge variant={STATUS_VARIANT[o.status]}>
                      {t(`settings.billing.statuses.${o.status}`)}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground-lighter">
                    {Number(o.plan.price) === 0
                      ? t('settings.billing.free')
                      : t(`settings.billing.pricePer.${o.plan.interval}`, {
                          price: money(o.plan.price, o.plan.currency),
                        })}
                  </p>
                </div>
                <p className="text-sm text-foreground-lighter">
                  {t('settings.billing.period', {
                    start: format.dateTime(new Date(o.period.start), {
                      dateStyle: 'medium',
                      timeZone: 'UTC',
                    }),
                    end: format.dateTime(new Date(new Date(o.period.end).getTime() - 1), {
                      dateStyle: 'medium',
                      timeZone: 'UTC',
                    }),
                  })}
                </p>
              </div>
              {o.cancelAtPeriodEnd ? (
                <div className="pt-4">
                  <Callout variant="warning">{t('settings.billing.cancelAtPeriodEnd')}</Callout>
                </div>
              ) : null}
            </Panel>

            {o.restricted ? (
              <Callout variant="warning" title={t('settings.billing.restrictedTitle')}>
                {t('settings.billing.restricted')}
              </Callout>
            ) : null}
            {actionError ? (
              <Callout variant="destructive">{errorText(t, actionError)}</Callout>
            ) : null}
            {o.paymentsEnabled && canManage && subscribed ? (
              <div>
                <Button size="small" onClick={() => portal.mutate()} disabled={portal.isPending}>
                  {t('settings.billing.manage')}
                </Button>
              </div>
            ) : null}
            {canBuy && paidPlans.length > 0 ? (
              <section className="space-y-2">
                <h2 className="text-sm text-foreground">{t('settings.billing.choosePlan')}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {paidPlans.map((p) => (
                    <Panel key={p.key} title={tr(`billing.plans.${p.key}`, p.key)}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-foreground-light">
                          {t(`settings.billing.pricePer.${p.interval}`, {
                            price: money(p.price, p.currency),
                          })}
                        </p>
                        <Button
                          size="small"
                          variant="primary"
                          disabled={checkout.isPending}
                          onClick={() => checkout.mutate(p.key)}
                        >
                          {t('settings.billing.subscribe')}
                        </Button>
                      </div>
                    </Panel>
                  ))}
                </div>
                <p className="text-xs text-foreground-lighter">
                  {t('settings.billing.afterCheckout')}
                </p>
              </section>
            ) : null}

            {subscribed && hasOverage ? (
              <SpendCap
                orgId={orgId}
                current={o.spendCap}
                currency={o.plan.currency}
                canManage={canManage}
              />
            ) : null}

            {o.metrics.length === 0 ? (
              <EmptyState
                icon={<Gauge />}
                title={t('settings.billing.noMetricsTitle')}
                description={t('settings.billing.noMetrics')}
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t('settings.billing.metric')}</TH>
                    <TH>{t('settings.billing.usage')}</TH>
                    <TH className="w-1/3">{t('settings.billing.quota')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {o.metrics.map((m) => {
                    const name = tr(`billing.metrics.${m.key}`, m.key)
                    const unit = tr(`billing.units.${m.unit}`, m.unit)
                    return (
                      <TR key={m.key}>
                        <TD>{name}</TD>
                        <TD>
                          {m.included === null
                            ? `${qty(m.used)} ${unit}`
                            : t('settings.billing.usedOf', {
                                used: qty(m.used),
                                included: qty(m.included),
                                unit,
                              })}
                          <p className="text-xs text-foreground-lighter">
                            {limitText(m, o.plan.currency)}
                          </p>
                        </TD>
                        <TD>
                          {m.percent === null ? null : <Progress value={m.percent} label={name} />}
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}

            {periods.data && periods.data.length > 0 ? (
              <section className="space-y-2">
                <h2 className="text-sm text-foreground">{t('settings.billing.periods')}</h2>
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('settings.billing.periodCol')}</TH>
                      <TH>{t('settings.billing.overageCol')}</TH>
                      <TH>{t('settings.billing.dueCol')}</TH>
                      <TH>{t('settings.members.status')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {periods.data.map((p) => (
                      <TR key={p.id}>
                        <TD>
                          {format.dateTimeRange(
                            new Date(p.periodStart),
                            new Date(new Date(p.periodEnd).getTime() - 1),
                            { dateStyle: 'medium', timeZone: 'UTC' },
                          )}
                        </TD>
                        <TD>{money(p.overageTotal, p.currency)}</TD>
                        <TD>{money(p.amountDue, p.currency)}</TD>
                        <TD>
                          <Badge variant={PERIOD_VARIANT[p.status]}>
                            {t(`settings.billing.periodStatuses.${p.status}`)}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </section>
            ) : null}
          </div>
        ) : null}
      </PageContainer>
    </>
  )
}

function SpendCap({
  orgId,
  current,
  currency,
  canManage,
}: {
  orgId: string
  current: string | null
  currency: string
  canManage: boolean
}) {
  const t = useTranslations()
  const format = useFormatter()
  const qc = useQueryClient()
  const [value, setValue] = useState(current ?? '')
  const save = useMutation({
    mutationFn: async (spendCap: string | null) =>
      unwrap(await apiClient.PUT('/api/v1/billing/spend-cap', { body: { spendCap } })),
    onSuccess: async (r) => {
      setValue(r.spendCap ?? '')
      await qc.invalidateQueries({ queryKey: billingKeys.overview(orgId) })
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(value.trim() === '' ? null : value.trim())
  }
  const shown =
    current === null
      ? t('settings.billing.noCap')
      : format.number(Number(current), { style: 'currency', currency })
  return (
    <Panel title={t('settings.billing.spendCap')} description={t('settings.billing.spendCapHint')}>
      {canManage ? (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <Field label={t('settings.billing.spendCapLabel', { currency })} className="w-48">
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={value}
                placeholder={t('settings.billing.noCap')}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="small" variant="primary" disabled={save.isPending}>
            {t('settings.billing.save')}
          </Button>
          {save.error ? <Callout variant="destructive">{errorText(t, save.error)}</Callout> : null}
        </form>
      ) : (
        <p className="text-sm text-foreground-light">{shown}</p>
      )}
    </Panel>
  )
}
