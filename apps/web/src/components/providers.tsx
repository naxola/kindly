'use client'

import { Toaster, TooltipProvider } from '@saas/ui'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, useTheme } from 'next-themes'
import { useState, type ReactNode } from 'react'
import { sessionRedirect } from '@/client/session-redirect.ts'

/**
 * An expired session or a missing organization is the same everywhere: instead of a generic
 * error in each screen, go to sign-in (and come back) or to onboarding.
 */
function onSessionError(error: unknown) {
  const to = sessionRedirect(error, window.location.pathname, window.location.search)
  if (to) window.location.assign(to)
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return <Toaster theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />
}

export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: onSessionError }),
        mutationCache: new MutationCache({ onError: onSessionError }),
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  )
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
