"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";

const STORAGE_KEY = "kindly.affiliateRequests.notified";
const POLL_MS = 60_000;

function readNotified(): number {
  try {
    return Number(window.sessionStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeNotified(count: number) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(count));
  } catch {
    // no storage: at worst the toast shows again on the next load
  }
}

/**
 * Tells an ADMIN that altas are waiting (docs/DECISIONS.md, "Altas de
 * afiliados por webhook"). Toasts once per increase — not on every page
 * change — and polls once a minute so an alta that arrives while the admin
 * is working shows up without a reload. Not shown on the page that lists
 * them, where the list itself is the notice.
 */
export function AffiliateRequestsNotifier({ initialCount }: { initialCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const onListRef = useRef(false);

  useEffect(() => {
    onListRef.current = pathname.startsWith("/affiliate-requests");
  }, [pathname]);

  useEffect(() => {
    function notify(count: number) {
      const notified = readNotified();
      if (count < notified || count === 0) {
        writeNotified(count);
        return;
      }
      if (count === notified) return;
      writeNotified(count);
      if (onListRef.current) return;
      toast.info(count === 1 ? "Tienes 1 alta pendiente de asignar" : `Tienes ${count} altas pendientes de asignar`, {
        id: "affiliate-requests",
        description: "Revisa la asignación propuesta y confírmala.",
        duration: 15_000,
        action: { label: "Revisar", onClick: () => router.push("/affiliate-requests") },
      });
    }

    notify(initialCount);

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/affiliate-requests/count", { cache: "no-store" });
        if (!response.ok) return;
        const { count } = (await response.json()) as { count: number };
        if (count !== readNotified()) {
          notify(count);
          router.refresh();
        }
      } catch {
        // offline: try again next tick
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [initialCount, router]);

  return null;
}
