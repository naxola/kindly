'use client'

export { toast } from 'sonner'
import { Toaster as Sonner } from 'sonner'

export function Toaster({ theme }: { theme?: 'light' | 'dark' | 'system' }) {
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: '!bg-overlay !border-border-strong !text-foreground !rounded-md',
          description: '!text-foreground-light',
        },
      }}
    />
  )
}
