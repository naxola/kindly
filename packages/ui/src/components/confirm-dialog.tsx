'use client'

import { AlertDialog as Primitive } from 'radix-ui'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { Button, type ButtonProps } from './button.tsx'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Summary of the action's impact (what is going to happen). */
  children?: ReactNode
  confirmLabel: string
  cancelLabel: string
  variant?: 'primary' | 'destructive' | 'warning'
  /** If given, a reason is mandatory and is passed to onConfirm. */
  reason?: { label: string; placeholder?: string; minLength?: number }
  loading?: boolean
  onConfirm: (reason?: string) => void | Promise<void>
}

/**
 * Confirmation dialog to approve, reject, cancel or delete (ADR 0007).
 * With `reason`, it cannot be confirmed without typing the reason.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  reason,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [text, setText] = useState('')
  const reasonId = useId()
  const minLength = reason?.minLength ?? 3
  const canConfirm = !loading && (!reason || text.trim().length >= minLength)
  const confirmVariant: ButtonProps['variant'] = variant

  return (
    <Primitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setText('')
        onOpenChange(next)
      }}
    >
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Primitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-overlay shadow-xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="space-y-1.5 border-b border-border px-5 py-4">
            <Primitive.Title className="text-base text-foreground">{title}</Primitive.Title>
            {description ? (
              <Primitive.Description className="text-sm text-foreground-light">
                {description}
              </Primitive.Description>
            ) : null}
          </div>
          {children || reason ? (
            <div className="space-y-3 px-5 py-4 text-sm text-foreground-light">
              {children}
              {reason ? (
                <div className="space-y-1.5">
                  <label htmlFor={reasonId} className="text-xs text-foreground-light">
                    {reason.label}
                  </label>
                  <textarea
                    id={reasonId}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={reason.placeholder}
                    rows={3}
                    className="w-full resize-none rounded-md border border-border-control bg-control px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 bg-surface-100 px-5 py-3 rounded-b-lg border-t border-border">
            <Primitive.Cancel asChild>
              <Button variant="default" disabled={loading}>
                {cancelLabel}
              </Button>
            </Primitive.Cancel>
            <Button
              variant={confirmVariant}
              disabled={!canConfirm}
              aria-busy={loading}
              onClick={() => void onConfirm(reason ? text.trim() : undefined)}
            >
              {confirmLabel}
            </Button>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
