import { cva, type VariantProps } from "class-variance-authority";

/**
 * Button styles, kept in their own module (no `"use client"`) so a Server
 * Component can style a `<Link>` as a button — `<Link
 * className={buttonVariants()}>` — without nesting interactive elements.
 * Importing this from `button.tsx` instead, which *is* `"use client"`,
 * would make `buttonVariants` a client-only export too (Next's RSC
 * boundary applies to every export of a file, not just the ones that
 * actually use hooks) and break exactly that pattern.
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

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
