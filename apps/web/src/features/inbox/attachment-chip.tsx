'use client'

import { Paperclip } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ApiError, errorText, type ApiErrorBody } from '@/client/errors.ts'
import type { ThreadMessageData } from './queries.ts'

type Attachment = NonNullable<ThreadMessageData['attachment']>

/**
 * The file a message carries. Kindly keeps no copy: "Descargar" asks the proxy to stream it from
 * the provider to this browser, which saves it. A refusal (expired, too many downloads, no access)
 * is shown here instead of downloading an error page.
 */
export function AttachmentChip({
  attachment,
  conversationId,
  messageId,
}: {
  attachment: Attachment
  conversationId: string
  messageId: string
}) {
  const t = useTranslations('inbox.attachment')
  const all = useTranslations()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = t(`kinds.${attachment.kind}`)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/v1/conversations/${conversationId}/messages/${messageId}/media`,
        { credentials: 'same-origin' },
      )
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null
        setError(errorText(all, new ApiError(response.status, body)))
        return
      }
      const disposition = response.headers.get('content-disposition') ?? ''
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
      const name = encoded ? decodeURIComponent(encoded) : (attachment.filename ?? label)
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError(all('errors.UNKNOWN'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-0.5 rounded-md border border-border bg-background px-2.5 py-2 text-foreground">
      <p className="flex items-center gap-1.5 text-xs font-medium [overflow-wrap:anywhere]">
        <Paperclip className="size-3.5 shrink-0" aria-hidden />
        {attachment.filename ? `${label}: ${attachment.filename}` : label}
      </p>
      <p className="text-[11px] text-foreground-lighter">
        {t('notStored')} ·{' '}
        {attachment.downloadable ? (
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy}
            className="rounded-sm text-foreground underline disabled:opacity-60"
          >
            {busy ? t('downloading') : t('download')}
          </button>
        ) : (
          <span>{t('expired')}</span>
        )}
      </p>
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
