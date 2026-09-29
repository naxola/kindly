"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * One TanStack Query cache for the authenticated app (docs/DECISIONS.md,
 * 2026-09-29, "Inbox con caché cliente"), mounted in the `(app)` layout so
 * it survives navigating away from a module and back. One client per
 * browser tab — created in state, never at module level, so a server render
 * can never share one between requests.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Server-seeded data (hydration) counts as fresh for a moment
            // instead of being refetched on the very first render.
            staleTime: 5_000,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
