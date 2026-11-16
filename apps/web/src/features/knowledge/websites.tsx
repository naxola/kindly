'use client'

import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Panel,
  SidePanel,
  Table,
  TBody,
  TD,
  TH,
  THead,
  toast,
  TR,
} from '@saas/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useMemo, useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { knowledgeKeys, useWebsite, useWebsites, websiteKeys, type WebsiteData } from './queries.ts'

/** Pages one indexing may start (the server enforces the same limit). */
const MAX_PICK = 30
const PAGE_SIZE = 25

const STATUS_BADGE = {
  DISCOVERED: 'default',
  INDEXING: 'warning',
  INDEXED: 'success',
  FAILED: 'destructive',
} as const

/**
 * Websites as knowledge sources (administrators): the list of sites and the button to add one. A
 * site opens in a side panel where its pages are picked for indexing.
 */
export function WebsitesSection() {
  const t = useTranslations('knowledge.websites')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const sites = useWebsites(orgId, true)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: async (url: string) =>
      unwrap(await apiClient.POST('/api/v1/knowledge/websites', { body: { url } })),
    onSuccess: async (site) => {
      await qc.invalidateQueries({ queryKey: websiteKeys.list(orgId) })
      setAdding(false)
      setOpen(site.id)
    },
  })

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    add.mutate(field(new FormData(e.currentTarget), 'url').trim())
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base">{t('title')}</h2>
        <Button size="small" onClick={() => setAdding(true)}>
          <Globe aria-hidden />
          {t('add')}
        </Button>
      </div>
      <p className="text-sm text-foreground-lighter">{t('hint')}</p>
      {sites.error ? <Callout variant="destructive">{errorText(all, sites.error)}</Callout> : null}
      {(sites.data ?? []).length > 0 ? (
        <ul className="space-y-2" aria-label={t('title')}>
          {(sites.data ?? []).map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">{s.name}</p>
                <p className="text-xs break-all text-foreground-lighter">{s.url}</p>
                <p className="text-xs text-foreground-lighter">
                  {t('countsLine', {
                    total: s.counts.total,
                    indexed: s.counts.INDEXED,
                    indexing: s.counts.INDEXING,
                    failed: s.counts.FAILED,
                  })}
                </p>
              </div>
              <Button
                size="small"
                aria-label={t('openFor', { name: s.name })}
                onClick={() => setOpen(s.id)}
              >
                {t('open')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <SidePanel
        open={adding}
        onOpenChange={setAdding}
        title={t('addTitle')}
        description={t('addDescription')}
        closeLabel={all('shell.close')}
      >
        <form className="space-y-4" onSubmit={onAdd}>
          {add.error ? <Callout variant="destructive">{errorText(all, add.error)}</Callout> : null}
          <Field label={t('url')} hint={t('urlHint')}>
            {(p) => (
              <Input {...p} name="url" type="url" required placeholder="https://www.ejemplo.es" />
            )}
          </Field>
          <Button type="submit" variant="primary" disabled={add.isPending}>
            {add.isPending ? t('looking') : t('addAction')}
          </Button>
        </form>
      </SidePanel>
      {open ? <WebsitePanel websiteId={open} onClose={() => setOpen(null)} /> : null}
    </section>
  )
}

function WebsitePanel({ websiteId, onClose }: { websiteId: string; onClose: () => void }) {
  const t = useTranslations('knowledge.websites')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const site = useWebsite(orgId, websiteId)
  const [deleting, setDeleting] = useState(false)
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: websiteKeys.detail(orgId, websiteId) }),
      qc.invalidateQueries({ queryKey: websiteKeys.list(orgId) }),
      qc.invalidateQueries({ queryKey: knowledgeKeys.list(orgId) }),
    ])

  const rediscover = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/v1/knowledge/websites/{id}/rediscover', {
          params: { path: { id: websiteId } },
        }),
      ),
    onSuccess: async (r) => {
      toast.success(t('rediscovered', { count: r.added }))
      await refresh()
    },
  })
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.DELETE('/api/v1/knowledge/websites/{id}', {
          params: { path: { id: websiteId } },
        }),
      ),
    onSuccess: async () => {
      toast.success(t('deleted'))
      await qc.invalidateQueries({ queryKey: websiteKeys.list(orgId) })
      onClose()
    },
  })
  const error = site.error ?? rediscover.error ?? remove.error
  const w = site.data?.website

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={w?.name ?? t('loading')}
      description={w?.url}
      closeLabel={all('shell.close')}
      size="large"
    >
      <div className="space-y-6">
        {error ? <Callout variant="destructive">{errorText(all, error)}</Callout> : null}
        {w && site.data ? (
          <>
            <Panel title={t('infoTitle')}>
              <div className="flex flex-wrap gap-4 p-4 text-sm">
                {w.imageUrl ? (
                  <img
                    src={w.imageUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-20 w-32 rounded-md border border-border object-cover"
                  />
                ) : null}
                <dl className="grid min-w-0 flex-1 grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
                  <dt className="text-foreground-lighter">{t('source')}</dt>
                  <dd>{t(`sources.${w.discoverySource}`)}</dd>
                  <dt className="text-foreground-lighter">{t('discoveredAt')}</dt>
                  <dd>{format.dateTime(new Date(w.discoveredAt), { dateStyle: 'medium' })}</dd>
                  <dt className="text-foreground-lighter">{t('pagesCount')}</dt>
                  <dd>
                    {t('countsLine', {
                      total: w.counts.total,
                      indexed: w.counts.INDEXED,
                      indexing: w.counts.INDEXING,
                      failed: w.counts.FAILED,
                    })}
                  </dd>
                </dl>
              </div>
              {w.truncated ? (
                <p className="px-4 pb-4 text-xs text-foreground-lighter">{t('truncated')}</p>
              ) : null}
            </Panel>
            <PagesPanel data={site.data} onChanged={refresh} />
            <SettingsPanel data={site.data} onChanged={refresh} />
            <Panel title={t('maintenanceTitle')}>
              <div className="flex flex-wrap gap-2 p-4">
                <Button disabled={rediscover.isPending} onClick={() => rediscover.mutate()}>
                  {t('rediscover')}
                </Button>
                <Button variant="destructive" onClick={() => setDeleting(true)}>
                  {t('delete')}
                </Button>
              </div>
            </Panel>
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        confirmLabel={t('delete')}
        cancelLabel={all('common.cancel')}
        variant="destructive"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </SidePanel>
  )
}

function PagesPanel({ data, onChanged }: { data: WebsiteData; onChanged: () => Promise<unknown> }) {
  const t = useTranslations('knowledge.websites')
  const all = useTranslations()
  const k = useTranslations('knowledge')
  const websiteId = data.website.id
  const [filter, setFilter] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const visible = useMemo(
    () =>
      data.pages.filter((p) =>
        `${p.url} ${p.title ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [data.pages, filter],
  )
  const failed = data.pages.filter((p) => p.status === 'FAILED')

  const index = useMutation({
    mutationFn: async (pageIds: string[]) =>
      unwrap(
        await apiClient.POST('/api/v1/knowledge/websites/{id}/index', {
          params: { path: { id: websiteId } },
          body: { pageIds },
        }),
      ),
    onSuccess: async (r) => {
      toast.success(t('indexing', { count: r.started }))
      setPicked(new Set())
      await onChanged()
    },
  })
  const addPage = useMutation({
    mutationFn: async (url: string) =>
      unwrap(
        await apiClient.POST('/api/v1/knowledge/websites/{id}/pages', {
          params: { path: { id: websiteId } },
          body: { url },
        }),
      ),
    onSuccess: onChanged,
  })
  const error = index.error ?? addPage.error

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (on && next.size < MAX_PICK) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function onAddPage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    addPage.mutate(field(new FormData(form), 'pageUrl').trim(), { onSuccess: () => form.reset() })
  }

  return (
    <Panel title={t('pagesTitle')} description={t('pagesHint', { max: MAX_PICK })}>
      <div className="space-y-3 p-4">
        {error ? <Callout variant="destructive">{errorText(all, error)}</Callout> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setShown(PAGE_SIZE)
            }}
            aria-label={t('filter')}
            placeholder={t('filter')}
            className="min-w-0 flex-1"
          />
          <Button
            variant="primary"
            disabled={picked.size === 0 || index.isPending}
            onClick={() => index.mutate([...picked])}
          >
            {t('indexPicked', { count: picked.size, max: MAX_PICK })}
          </Button>
          {failed.length > 0 ? (
            <Button
              disabled={index.isPending}
              onClick={() => index.mutate(failed.slice(0, MAX_PICK).map((p) => p.id))}
            >
              {t('retryFailed', { count: failed.length })}
            </Button>
          ) : null}
        </div>
        <Table>
          <THead>
            <TR>
              <TH>
                <span className="sr-only">{t('pick')}</span>
              </TH>
              <TH>{t('page')}</TH>
              <TH>{t('state')}</TH>
            </TR>
          </THead>
          <TBody>
            {visible.slice(0, shown).map((p) => (
              <TR key={p.id}>
                <TD className="w-8">
                  {p.status === 'DISCOVERED' || p.status === 'FAILED' ? (
                    <Checkbox
                      checked={picked.has(p.id)}
                      disabled={!picked.has(p.id) && picked.size >= MAX_PICK}
                      onChange={(e) => toggle(p.id, e.target.checked)}
                      label={<span className="sr-only">{t('pickPage', { url: p.url })}</span>}
                    />
                  ) : null}
                </TD>
                <TD className="max-w-0">
                  {p.documentId ? (
                    <Link
                      href={`/knowledge/${p.documentId}`}
                      className="block truncate text-foreground hover:underline"
                    >
                      {p.title ?? p.url}
                    </Link>
                  ) : (
                    <span className="block truncate">{p.title ?? p.url}</span>
                  )}
                  {p.title ? (
                    <span className="block truncate text-xs text-foreground-lighter">{p.url}</span>
                  ) : null}
                </TD>
                <TD className="whitespace-nowrap">
                  <Badge variant={STATUS_BADGE[p.status]}>{t(`pageStatus.${p.status}`)}</Badge>
                  {p.error ? (
                    <span className="block text-xs text-destructive">
                      {k.has(`ingestion.codes.${p.error}`)
                        ? k(`ingestion.codes.${p.error}`)
                        : k('ingestion.codes.EXTRACTION_FAILED')}
                    </span>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {visible.length > shown ? (
          <Button size="small" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            {t('showMore', { count: visible.length - shown })}
          </Button>
        ) : null}
        <form className="flex flex-wrap items-end gap-2" onSubmit={onAddPage}>
          <Field label={t('addPage')} className="min-w-0 flex-1">
            {(p) => (
              <Input {...p} name="pageUrl" type="url" required placeholder={data.website.url} />
            )}
          </Field>
          <Button type="submit" disabled={addPage.isPending}>
            {t('addPageAction')}
          </Button>
        </form>
      </div>
    </Panel>
  )
}

function SettingsPanel({
  data,
  onChanged,
}: {
  data: WebsiteData
  onChanged: () => Promise<unknown>
}) {
  const t = useTranslations('knowledge.websites')
  const all = useTranslations()
  const s = data.website.settings
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      unwrap(
        await apiClient.PUT('/api/v1/knowledge/websites/{id}', {
          params: { path: { id: data.website.id } },
          body: body as never,
        }),
      ),
    onSuccess: async () => {
      toast.success(t('saved'))
      await onChanged()
    },
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const text = (name: string) => field(form, name).trim() || null
    save.mutate({
      name: field(form, 'name').trim(),
      version: field(form, 'version').trim(),
      publishAsCurrent: form.get('publishAsCurrent') === 'on',
      effectiveFrom: text('effectiveFrom'),
      effectiveUntil: text('effectiveUntil'),
      sourceNote: text('sourceNote'),
      jurisdiction: text('jurisdiction'),
      territory: text('territory'),
      scope: text('scope'),
    })
  }

  return (
    <Panel title={t('settingsTitle')} description={t('settingsHint')}>
      <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={onSubmit}>
        {save.error ? (
          <Callout variant="destructive" className="sm:col-span-2">
            {errorText(all, save.error)}
          </Callout>
        ) : null}
        <Field label={t('fields.name')} className="sm:col-span-2">
          {(p) => <Input {...p} name="name" required defaultValue={data.website.name} />}
        </Field>
        <Field label={t('fields.version')}>
          {(p) => <Input {...p} name="version" required defaultValue={s.version} />}
        </Field>
        <Field label={t('fields.effectiveFrom')} hint={t('fields.effectiveFromHint')}>
          {(p) => (
            <Input {...p} name="effectiveFrom" type="date" defaultValue={s.effectiveFrom ?? ''} />
          )}
        </Field>
        <Field label={t('fields.effectiveUntil')}>
          {(p) => (
            <Input {...p} name="effectiveUntil" type="date" defaultValue={s.effectiveUntil ?? ''} />
          )}
        </Field>
        <Field label={t('fields.sourceNote')}>
          {(p) => <Input {...p} name="sourceNote" defaultValue={s.sourceNote ?? ''} />}
        </Field>
        <Field label={t('fields.jurisdiction')}>
          {(p) => <Input {...p} name="jurisdiction" defaultValue={s.jurisdiction ?? ''} />}
        </Field>
        <Field label={t('fields.territory')}>
          {(p) => <Input {...p} name="territory" defaultValue={s.territory ?? ''} />}
        </Field>
        <Field label={t('fields.scope')}>
          {(p) => <Input {...p} name="scope" defaultValue={s.scope ?? ''} />}
        </Field>
        <Checkbox
          name="publishAsCurrent"
          defaultChecked={s.publishAsCurrent}
          label={t('fields.publishAsCurrent')}
          description={t('fields.publishAsCurrentHint')}
          className="sm:col-span-2"
        />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Panel>
  )
}
