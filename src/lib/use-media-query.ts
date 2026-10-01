"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

/**
 * `false` on the server and until hydration settles, then the real match —
 * used to pick a Sheet's chrome by viewport (docs/ui/CHAT.md §4: anchored
 * `xl+` vs. modal). The one-frame flash this can cause on a wide screen is
 * the accepted cost of a real Dialog needing JS to decide whether to open
 * modally at all — a CSS-only `hidden`/`xl:flex` toggle cannot drive
 * Radix's focus trap, and a trapped-but-invisible dialog would hide the
 * rest of the page from assistive tech for nothing.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const noopSubscribe = () => () => {};

/**
 * `false` on the server and during hydration, `true` after — for a
 * component that has to tell "`useMediaQuery` said false because it really
 * doesn't match" apart from "because it can't know yet".
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
