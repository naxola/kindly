'use client'

import './globals.css'

/**
 * Failure of the root layout itself: there is no provider or translation here, so the text is
 * bilingual and fixed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-xl">Algo ha fallado · Something went wrong</h1>
          {error.digest ? <p className="text-xs">Ref: {error.digest}</p> : null}
          <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={reset}>
            Reintentar · Retry
          </button>
        </main>
      </body>
    </html>
  )
}
