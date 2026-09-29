"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export interface DataListItem {
  key: string;
  href: string;
}

/**
 * Dense list of link-rows with roving-tabindex keyboard navigation
 * (docs/ui/COMPONENTS.md; docs/ui/INBOX.md §5, docs/ui/ACCESSIBILITY.md §2):
 * Tab reaches the list once — the composite's single tab stop, tracked in
 * state rather than mutated on the DOM, so it survives re-renders (a fresh
 * `items` array from polling must not silently reset focus to row 0).
 * Arrow keys / `J`/`K` move it row to row; `Home`/`End` jump to the ends.
 */
export function DataList<T extends DataListItem>({
  items,
  renderItem,
  isSelected,
  onItemActivate,
  onItemIntent,
  "aria-label": ariaLabel,
  className,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  /** Marks a row as the one currently open elsewhere (e.g. Inbox's open conversation, docs/ui/CHAT.md §3): `state-selected` + a left bar + `aria-current="true"`. */
  isSelected?: (item: T) => boolean;
  /**
   * Handles a plain click itself instead of following `href` (the Inbox
   * opens its conversation panel client-side, docs/ui/CHAT.md §1). A
   * modified click (new tab/window) still follows the link as usual.
   */
  onItemActivate?: (item: T) => void;
  /** Pointer or keyboard focus reached the row — a cue to prefetch what activating it will need. */
  onItemIntent?: (item: T) => void;
  "aria-label": string;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const safeActiveIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));

  function focusRow(index: number) {
    if (items.length === 0) {
      return;
    }
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    setActiveIndex(clamped);
    rowRefs.current[clamped]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    switch (event.key.toLowerCase()) {
      case "arrowdown":
      case "j":
        event.preventDefault();
        focusRow(index + 1);
        break;
      case "arrowup":
      case "k":
        event.preventDefault();
        focusRow(index - 1);
        break;
      case "home":
        event.preventDefault();
        focusRow(0);
        break;
      case "end":
        event.preventDefault();
        focusRow(items.length - 1);
        break;
    }
  }

  return (
    <ul aria-label={ariaLabel} className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const selected = isSelected?.(item) ?? false;
        return (
          <li key={item.key}>
            <Link
              ref={(node) => {
                rowRefs.current[index] = node;
              }}
              href={item.href}
              // Prefetching a route the click will never navigate to is
              // only wasted server work (`onItemActivate` handles it).
              prefetch={onItemActivate ? false : undefined}
              tabIndex={index === safeActiveIndex ? 0 : -1}
              aria-current={selected ? "true" : undefined}
              onFocus={() => {
                setActiveIndex(index);
                onItemIntent?.(item);
              }}
              onPointerEnter={onItemIntent ? () => onItemIntent(item) : undefined}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={(event) => {
                // Re-clicking the already-open row is a no-op, never a
                // navigation to the URL the browser is already at (that
                // once dropped the Inbox list entirely, docs/ui/CHAT.md §5).
                if (selected) {
                  event.preventDefault();
                  return;
                }
                const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
                if (onItemActivate && !modified) {
                  event.preventDefault();
                  onItemActivate(item);
                }
              }}
              // `group`: lets `renderItem`'s content use `group-hover:`/
              // `group-focus:` (e.g. a hover background on the whole row).
              className={cn(
                "group block focus-inset",
                selected && "bg-state-selected border-l-2 border-l-primary",
              )}
            >
              {renderItem(item, index)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
