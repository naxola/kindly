'use client'

import { useEffect } from 'react'
import { initBrowserErrors } from '@/client/browser-errors.ts'

/** Starts the browser error reporting when the server handed over a DSN (runtime variable). */
export function BrowserErrors({ dsn, environment }: { dsn?: string; environment: string }) {
  useEffect(() => {
    if (dsn) void initBrowserErrors({ dsn, environment })
  }, [dsn, environment])
  return null
}
