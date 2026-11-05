"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { continueWebsiteImportAction } from "@/modules/knowledge/actions";

const IDLE_WAIT_MS = 3000;

/**
 * Keeps a website's import moving while its panel is open: each call indexes
 * one more time-boxed slice (`continueWebsiteImportAction`), then the page is
 * refreshed. The first slice already ran after the request that queued the
 * pages; this is what finishes a long import when that slice hit the
 * function's limit. Returns the error that stopped it, if any.
 */
export function useWebsiteImport(websiteId: string, waiting: number): string | null {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (waiting === 0 || running.current) return;
    running.current = true;
    let cancelled = false;

    (async () => {
      while (!cancelled) {
        const result = await continueWebsiteImportAction(websiteId);
        if (cancelled) return;
        if (result.error !== null) {
          setError(result.error);
          break;
        }
        router.refresh();
        if (result.remaining === 0) break;
        // Pages left but none claimable: another slice (the one that queued them) is still running.
        await new Promise((resolve) => setTimeout(resolve, IDLE_WAIT_MS));
      }
      running.current = false;
    })();

    return () => {
      cancelled = true;
      running.current = false;
    };
  }, [websiteId, waiting, router]);

  return error;
}
