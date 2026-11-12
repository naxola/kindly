"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export interface SegmentedControlItem {
  value: string;
  label: ReactNode;
  /** Present → this item navigates (the view lives in the URL, as Inbox's
   *  does, docs/ui/INBOX.md). Absent → pure client state via `onChange`. */
  href?: string;
  count?: number;
}

/**
 * A handful of mutually exclusive views (docs/ui/COMPONENTS.md): one ARIA
 * radiogroup, arrow-key navigation between segments. Two wire-ups share it
 * — link-based (Inbox's views) and state-based — so a page never has to
 * choose between "reusable component" and "URL is the source of truth".
 */
export function SegmentedControl({
  items,
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
}: {
  items: SegmentedControlItem[];
  value: string;
  onChange?: (value: string) => void;
  "aria-label": string;
  className?: string;
}) {
  function moveFocus(fromIndex: number, delta: number, container: HTMLElement) {
    const next = items[(fromIndex + delta + items.length) % items.length];
    container.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
    if (!next.href) {
      onChange?.(next.value);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-control bg-background-muted p-0.5", className)}
      onKeyDown={(event) => {
        const index = items.findIndex((item) => item.value === value);
        if (index === -1) {
          return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          moveFocus(index, 1, event.currentTarget);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(index, -1, event.currentTarget);
        }
      }}
    >
      {items.map((item) => {
        const selected = item.value === value;
        const content = (
          <>
            {item.label}
            {typeof item.count === "number" && item.count > 0 && (
              <span className={cn("ml-1.5", selected ? "text-foreground-lighter" : "text-foreground-muted")}>
                {item.count}
              </span>
            )}
          </>
        );
        const shared = {
          "data-value": item.value,
          role: "radio" as const,
          "aria-checked": selected,
          tabIndex: selected ? 0 : -1,
          className: cn(
            "rounded-sm px-3 py-1.5 type-label whitespace-nowrap focus-ring",
            selected ? "bg-surface-100 text-foreground shadow-xs" : "text-foreground-light hover:text-foreground",
          ),
        };
        return item.href ? (
          <Link key={item.value} href={item.href} {...shared}>
            {content}
          </Link>
        ) : (
          <button key={item.value} type="button" onClick={() => onChange?.(item.value)} {...shared}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
