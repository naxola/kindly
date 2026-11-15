'use client'

import { Badge, Button, Callout, ConfirmDialog, Field, Input, Panel, toast } from '@saas/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { renderSVG } from 'uqr'
import { useState, type FormEvent } from 'react'
import { authRequest, AuthError } from '@/client/auth.ts'
import { errorText } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { describeUserAgent } from '@/client/user-agent.ts'

/** Current session and whether the second factor is on (Better Auth `get-session`). */
function useSecurity() {
  return useQuery({
    queryKey: ['security'],
    staleTime: 0,
    queryFn: async () => {
      const res = await authRequest<{
        session: { token: string }
        user: { twoFactorEnabled?: boolean }
      }>('/get-session')
      if (!res.ok || !res.data) throw new AuthError(res.code ?? 'UNKNOWN')
      return {
        token: res.data.session.token,
        twoFactorEnabled: Boolean(res.data.user.twoFactorEnabled),
      }
    },
  })
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await authRequest<T>(path, body)
  if (!res.ok) throw new AuthError(res.code ?? 'UNKNOWN')
  return res.data as T
}

/** Second factor: set up with a QR and a first code, recovery codes, and turning it off. */
export function TwoFactorPanel() {
  const t = useTranslations()
  const qc = useQueryClient()
  const security = useSecurity()
  const [setup, setSetup] = useState<{ uri: string; secret: string; codes: string[] } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['security'] })

  const start = useMutation({
    mutationFn: async (password: string) => {
      const r = await call<{ totpURI: string; backupCodes: string[] }>('/two-factor/enable', {
        password,
      })
      return {
        uri: r.totpURI,
        secret: new URL(r.totpURI).searchParams.get('secret') ?? '',
        codes: r.backupCodes,
      }
    },
    onSuccess: setSetup,
  })
  const verify = useMutation({
    mutationFn: async (code: string) => call('/two-factor/verify-totp', { code }),
    onSuccess: async () => {
      toast.success(t('toasts.twoFactorOn'))
      setCodes(setup?.codes ?? null)
      setSetup(null)
      await refresh()
    },
  })
  const disable = useMutation({
    mutationFn: async (password: string) => call('/two-factor/disable', { password }),
    onSuccess: async () => {
      toast.success(t('toasts.twoFactorOff'))
      await refresh()
    },
  })
  const regenerate = useMutation({
    mutationFn: async (password: string) =>
      (await call<{ backupCodes: string[] }>('/two-factor/generate-backup-codes', { password }))
        .backupCodes,
    onSuccess: setCodes,
  })

  const password = (e: FormEvent<HTMLFormElement>) =>
    field(new FormData(e.currentTarget), 'password')
  const error = start.error ?? verify.error ?? disable.error ?? regenerate.error

  return (
    <Panel
      title={t('settings.security.twoFactor')}
      description={t('settings.security.twoFactorHint')}
    >
      <div className="max-w-md space-y-4">
        {error ? <Callout variant="destructive">{errorText(t, error)}</Callout> : null}

        {codes ? (
          <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
        ) : setup ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              verify.mutate(field(new FormData(e.currentTarget), 'code').replaceAll(/\s/g, ''))
            }}
          >
            <p className="text-sm text-foreground-light">{t('settings.security.scan')}</p>
            <div
              role="img"
              aria-label={t('settings.security.qrLabel')}
              className="w-44 rounded-md bg-white p-2 [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: renderSVG(setup.uri) }}
            />
            <p className="text-xs text-foreground-lighter">
              {t('settings.security.manualKey')}{' '}
              <code className="select-all break-all">{setup.secret}</code>
            </p>
            <Field label={t('auth.twoFactor.code')}>
              {(p) => (
                <Input
                  {...p}
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              )}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="small" variant="primary" disabled={verify.isPending}>
                {t('settings.security.activate')}
              </Button>
              <Button size="small" onClick={() => setSetup(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : security.data?.twoFactorEnabled ? (
          <>
            <Badge variant="success">{t('settings.security.on')}</Badge>
            <PasswordAction
              label={t('settings.security.newCodes')}
              pending={regenerate.isPending}
              onSubmit={(p) => regenerate.mutate(p)}
              getPassword={password}
            />
            <PasswordAction
              label={t('settings.security.turnOff')}
              destructive
              pending={disable.isPending}
              onSubmit={(p) => disable.mutate(p)}
              getPassword={password}
            />
          </>
        ) : (
          <PasswordAction
            label={t('settings.security.turnOn')}
            primary
            pending={start.isPending}
            onSubmit={(p) => start.mutate(p)}
            getPassword={password}
          />
        )}
      </div>
    </Panel>
  )
}

/** A button that asks for the password before running (turning the factor on, off, new codes). */
function PasswordAction({
  label,
  pending,
  onSubmit,
  getPassword,
  primary,
  destructive,
}: {
  label: string
  pending: boolean
  onSubmit: (password: string) => void
  getPassword: (e: FormEvent<HTMLFormElement>) => string
  primary?: boolean
  destructive?: boolean
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <div>
        <Button
          size="small"
          variant={primary ? 'primary' : destructive ? 'destructive' : 'default'}
          onClick={() => setOpen(true)}
        >
          {label}
        </Button>
      </div>
    )
  }
  return (
    <form
      className="space-y-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(getPassword(e))
      }}
    >
      <Field label={t('settings.security.confirmPassword', { action: label })}>
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        )}
      </Field>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="small"
          variant={destructive ? 'destructive' : 'primary'}
          disabled={pending}
        >
          {label}
        </Button>
        <Button size="small" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}

/** Recovery codes: shown once, to copy or download. They are not stored in the clear. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations()
  const text = codes.join('\n')
  return (
    <div className="space-y-3">
      <Callout variant="warning" title={t('settings.security.codesTitle')}>
        {t('settings.security.codesHint')}
      </Callout>
      <ul
        className="grid grid-cols-2 gap-1 rounded-md border border-border p-3 font-mono text-sm"
        aria-label={t('settings.security.codesTitle')}
      >
        {codes.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          size="small"
          onClick={() => {
            void navigator.clipboard.writeText(text)
            toast.success(t('toasts.copied'))
          }}
        >
          {t('settings.security.copy')}
        </Button>
        <Button
          size="small"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
            const a = document.createElement('a')
            a.href = url
            a.download = 'recovery-codes.txt'
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          {t('settings.security.download')}
        </Button>
        <Button size="small" variant="primary" onClick={onDone}>
          {t('settings.security.saved')}
        </Button>
      </div>
    </div>
  )
}

interface SessionRow {
  token: string
  userAgent?: string | null
  createdAt: string
  updatedAt: string
}

/** Open sessions of this person: the current one marked, the others can be closed. */
export function SessionsPanel() {
  const t = useTranslations()
  const format = useFormatter()
  const qc = useQueryClient()
  const security = useSecurity()
  const [closing, setClosing] = useState<SessionRow | null>(null)
  const sessions = useQuery({
    queryKey: ['sessions'],
    staleTime: 0,
    queryFn: async () => {
      const res = await authRequest<SessionRow[]>('/list-sessions')
      if (!res.ok || !res.data) throw new AuthError(res.code ?? 'UNKNOWN')
      return res.data
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['sessions'] })
  const revoke = useMutation({
    mutationFn: async (token: string) => call('/revoke-session', { token }),
    onSuccess: async () => {
      toast.success(t('toasts.sessionClosed'))
      setClosing(null)
      await refresh()
    },
  })
  const revokeOthers = useMutation({
    mutationFn: async () => call('/revoke-other-sessions', {}),
    onSuccess: async () => {
      toast.success(t('toasts.sessionsClosed'))
      await refresh()
    },
  })
  const current = security.data?.token
  const others = (sessions.data ?? []).filter((s) => s.token !== current)

  return (
    <Panel
      title={t('settings.security.sessions')}
      description={t('settings.security.sessionsHint')}
    >
      <div className="max-w-xl space-y-3">
        {sessions.error ? (
          <Callout variant="destructive">{errorText(t, sessions.error)}</Callout>
        ) : null}
        {(revoke.error ?? revokeOthers.error) ? (
          <Callout variant="destructive">
            {errorText(t, revoke.error ?? revokeOthers.error)}
          </Callout>
        ) : null}
        <ul className="divide-y divide-border rounded-md border border-border">
          {(sessions.data ?? []).map((s) => (
            <li key={s.token} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-foreground">
                  {describeUserAgent(s.userAgent) || t('settings.security.unknownDevice')}
                  {s.token === current ? (
                    <Badge variant="success" className="ml-2">
                      {t('settings.security.thisSession')}
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-foreground-lighter">
                  {t('settings.security.lastActive', {
                    date: format.dateTime(new Date(s.updatedAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
              </div>
              {s.token !== current ? (
                <Button size="tiny" variant="ghost" onClick={() => setClosing(s)}>
                  {t('settings.security.close')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {others.length > 0 ? (
          <Button
            size="small"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate()}
          >
            {t('settings.security.closeOthers')}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={!!closing}
        onOpenChange={(o) => !o && setClosing(null)}
        title={t('settings.security.close')}
        description={t('settings.security.closeConfirm')}
        confirmLabel={t('settings.security.close')}
        cancelLabel={t('common.cancel')}
        variant="destructive"
        loading={revoke.isPending}
        onConfirm={() => {
          if (closing) revoke.mutate(closing.token)
        }}
      />
    </Panel>
  )
}
