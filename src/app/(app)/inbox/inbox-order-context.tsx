"use client";

import { createContext, useContext, useRef, useState, useSyncExternalStore, type MutableRefObject, type ReactNode } from "react";

interface InboxOrderApi {
  getOrder: () => string[];
  setOrder: (ids: string[]) => void;
  subscribe: (listener: () => void) => () => void;
  /** Set by the list; moves keyboard focus to its active row (`F6`). */
  focusListRef: MutableRefObject<(() => void) | null>;
}

const InboxOrderContext = createContext<InboxOrderApi | null>(null);

const EMPTY_ORDER: string[] = [];

/**
 * Shares the list's visible order with the conversation panel — both live
 * under `inbox/layout.tsx` but in different parallel-route slots, so they
 * cannot pass props directly. Used for "anterior/siguiente conversación"
 * (`Alt+↑/↓`) and the `F6` list↔panel focus switch (docs/ui/CHAT.md §4).
 *
 * A small external store, not `useState`: the list re-derives its id array
 * on every 5s poll even when nothing actually moved, and the panel has no
 * reason to re-render for that — only a genuine reorder (or membership
 * change) notifies subscribers.
 */
export function InboxOrderProvider({ children }: { children: ReactNode }) {
  const orderRef = useRef<string[]>(EMPTY_ORDER);
  const focusListRef = useRef<(() => void) | null>(null);
  const listenersRef = useRef(new Set<() => void>());

  // A stable object, created once — `useState`, not `useRef`: reading
  // `.current` during render is what `react-hooks/refs` exists to catch,
  // even though this object never itself changes after mount.
  const [api] = useState<InboxOrderApi>(() => ({
    getOrder: () => orderRef.current,
    setOrder: (ids) => {
      const current = orderRef.current;
      const unchanged = ids.length === current.length && ids.every((id, index) => id === current[index]);
      if (unchanged) {
        return;
      }
      orderRef.current = ids;
      listenersRef.current.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
    focusListRef,
  }));

  return <InboxOrderContext.Provider value={api}>{children}</InboxOrderContext.Provider>;
}

function useInboxOrderApi(): InboxOrderApi {
  const context = useContext(InboxOrderContext);
  if (!context) {
    throw new Error("useInboxOrder must be used within InboxOrderProvider");
  }
  return context;
}

/** For the list: publishes its current order, and the ref it focuses on `F6`. */
export function useInboxOrderPublisher() {
  const { setOrder, focusListRef } = useInboxOrderApi();
  return { setOrder, focusListRef };
}

/** For the panel: the list's current order, reactively (re-renders only when it changes). */
export function useInboxOrderList(): string[] {
  const { getOrder, subscribe } = useInboxOrderApi();
  return useSyncExternalStore(subscribe, getOrder, () => EMPTY_ORDER);
}

/** For the panel: the ref the list registered to move focus to its active row (`F6`). */
export function useInboxFocusList(): MutableRefObject<(() => void) | null> {
  return useInboxOrderApi().focusListRef;
}
