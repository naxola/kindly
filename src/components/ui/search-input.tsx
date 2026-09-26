"use client";

import { forwardRef, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/cn";

export interface SearchInputProps extends InputProps {
  /** Called on `Esc`. The caller owns the value, so clearing is theirs to do. */
  onClear?: () => void;
}

/**
 * Search field with the leading icon and the `/` shortcut
 * (docs/ui/COMPONENTS.md; docs/ui/INBOX.md §5). The shortcut is ignored
 * while any text field already has focus, so it never steals a literal
 * "/" from something the user is typing.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, onKeyDown, onClear, ...props },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function focusOnSlash(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        innerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", focusOnSlash);
    return () => document.removeEventListener("keydown", focusOnSlash);
  }, []);

  return (
    <span className="relative inline-flex w-full items-center">
      <Search aria-hidden className="pointer-events-none absolute left-2.5 size-4 text-foreground-lighter" />
      <Input
        ref={(node) => {
          innerRef.current = node;
          if (typeof forwardedRef === "function") {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        }}
        type="search"
        className={cn("pl-8", className)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key === "Escape") {
            onClear?.();
          }
        }}
        {...props}
      />
    </span>
  );
});
