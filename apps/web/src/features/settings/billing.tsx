'use client'

import {
  Badge,
  Callout,
  EmptyState,
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
import { useFormatter, useTranslations } from 'next-intl'
import { errorText } from '@/client/errors.ts'
import { useBillingOverview } from '@/client/queries.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'

type Overview = NonNullable<ReturnType<typeof useBillingOverview>['data']>
type Metric = Overview['metrics'][number]

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
          </div>
        ) : null}
      </PageContainer>
    </>
  )
}
