"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";

/**
 * Button styles, exported on their own so a `<Link>` can look like a button
 * without nesting interactive elements: `<Link className={buttonVariants()}>`.
 *
 * Variants map to action weight (docs/ui/COMPONENTS.md): one `primary` per
 * view at most; `danger` only inside a confirmation, never as the first
 * click of a destructive flow.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border",
    "type-label select-none",
    "transition-colors duration-(--duration-fast) ease-standard",
    "focus-ring cursor-pointer",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover aria-disabled:hover:bg-primary",
        default:
          "border-border-strong bg-surface-100 text-foreground shadow-xs hover:bg-state-hover aria-disabled:hover:bg-surface-100",
        outline:
          "border-border-control bg-transparent text-foreground hover:bg-state-hover aria-disabled:hover:bg-transparent",
        ghost:
          "border-transparent bg-transparent text-foreground-light hover:bg-state-hover hover:text-foreground aria-disabled:hover:bg-transparent",
        link: "h-auto border-transparent bg-transparent px-0 text-primary underline-offset-4 hover:underline",
        danger:
          "border-transparent bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive-hover aria-disabled:hover:bg-destructive",
      },
      size: {
        sm: "h-control-sm px-2.5",
        md: "h-control-md px-3",
        lg: "h-control-lg px-4",
        "icon-sm": "size-control-sm p-0",
        "icon-md": "size-control-md p-0",
      },
      block: {
        true: "w-full",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
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
