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
  "aria-label": ariaLabel,
  className,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  /** Marks a row as the one currently open elsewhere (e.g. Inbox's open conversation, docs/ui/CHAT.md §3): `state-selected` + a left bar + `aria-current="true"`. */
  isSelected?: (item: T) => boolean;
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
              tabIndex={index === safeActiveIndex ? 0 : -1}
              aria-current={selected ? "true" : undefined}
              onFocus={() => setActiveIndex(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={(event) => {
                // Re-clicking the already-open row would navigate to the
                // exact URL the browser is already at. Next's router does
                // not treat that as a no-op the way a plain same-page link
                // click would — for a target using intercepted/parallel
                // routes (Inbox's conversation panel) it can resolve the
                // slots differently the second time, dropping the list
                // entirely instead of re-showing it next to the panel
                // (found live, not in any test — docs/ui/CHAT.md §1 already
                // flagged a related, previously unreproduced click-pattern
                // bug in the same area). Never letting the click start a
                // navigation to where we already are avoids the whole class
                // of bug outright.
                if (selected) {
                  event.preventDefault();
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
