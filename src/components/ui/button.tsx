"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";
import { buttonVariants, type ButtonVariantProps } from "@/components/ui/button-variants";

// Re-exported for existing imports of `buttonVariants` from this module.
// Server Components should import it from "@/components/ui/button-variants"
// directly instead — see that file for why.
export { buttonVariants };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {
  /** Shows a spinner, blocks activation and announces the busy state. */
  loading?: boolean;
  /** Replaces the label while loading ("Enviando…"). Defaults to the label. */
  loadingText?: ReactNode;
  /** Icon rendered before the label. Decorative: always `aria-hidden`. */
  icon?: ReactNode;
  /**
   * Why the action is unavailable. When set together with `disabled`, the
   * button stays focusable (`aria-disabled`) so keyboard and screen-reader
   * users can discover it and hear the reason (docs/ui/ACCESSIBILITY.md,
   * "Deshabilitado con motivo"). Use it for permission gates and business
   * rules, not for an empty form.
   */
  disabledReason?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    loading = false,
    loadingText,
    icon,
    disabled,
    disabledReason,
    children,
    type = "button",
    onClick,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  const reasonId = useId();
  const blocked = Boolean(disabled) || loading;
  // A disabled button with a reason stays in the tab order; a plain disabled
  // one uses the native attribute and leaves it.
  const focusableWhenDisabled = Boolean(disabled && disabledReason);

  const describedBy = [ariaDescribedBy, focusableWhenDisabled && reasonId].filter(Boolean).join(" ");

  return (
    <>
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size, block }), className)}
        disabled={blocked && !focusableWhenDisabled}
        aria-disabled={focusableWhenDisabled || undefined}
        aria-busy={loading || undefined}
        aria-describedby={describedBy || undefined}
        onClick={(event) => {
          if (blocked) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        {...props}
      >
        {loading ? <Spinner size="sm" /> : icon ? <span aria-hidden>{icon}</span> : null}
        {loading && loadingText ? loadingText : children}
      </button>
      {/* Outside the button: inside, it would become part of its name. */}
      {focusableWhenDisabled && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </>
  );
});
