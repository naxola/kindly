'use client'

import { Dialog as Primitive } from 'radix-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export interface SidePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Acciones del pie (p. ej. Cancelar / Guardar). */
  footer?: ReactNode
  size?: 'medium' | 'large' | 'xlarge'
  closeLabel: string
  children: ReactNode
}

const widths = { medium: 'max-w-lg', large: 'max-w-2xl', xlarge: 'max-w-4xl' }

/** Side panel sliding in from the right to create, edit or view a detail (ADR 0007). */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = 'medium',
  closeLabel,
  children,
}: SidePanelProps) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Primitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border-strong bg-background-alt shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-200',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-150',
            widths[size],
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
            <div className="min-w-0 space-y-0.5">
              <Primitive.Title className="truncate text-base text-foreground">
                {title}
              </Primitive.Title>
              {description ? (
                <Primitive.Description className="text-xs text-foreground-lighter">
                  {description}
                </Primitive.Description>
              ) : null}
            </div>
            <Primitive.Close
              aria-label={closeLabel}
              className="rounded-md p-1 text-foreground-lighter hover:bg-surface-200 hover:text-foreground"
            >
              <X className="size-4" />
            </Primitive.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="flex justify-end gap-2 border-t border-border bg-surface-100 px-5 py-3">
              {footer}
            </footer>
          ) : null}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
