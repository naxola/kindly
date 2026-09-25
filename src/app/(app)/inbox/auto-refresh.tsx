"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the current server page every few seconds while the tab is
 * visible (PKG-013), so the Inbox list picks up new conversations and
 * unread badges without a reload. Polling, not realtime infrastructure:
 * see docs/DECISIONS.md, 2026-09-25.
 */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
