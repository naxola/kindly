import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shared look of every text-like control, so an Input, a Select and a Button
 * of the same `size` line up in one row (heights come from --control-h-*).
 *
 * Invalid state is driven by `aria-invalid`, which `Field` sets — styling
 * and accessibility cannot drift apart.
 */
export const controlVariants = cva(
  [
    "w-full min-w-0 rounded-control border border-border-control bg-control text-foreground type-body",
    "placeholder:text-foreground-lighter",
    "transition-colors duration-(--duration-fast) ease-standard",
    "hover:border-foreground-lighter",
    "focus-ring focus-visible:border-ring",
    "disabled:cursor-not-allowed disabled:bg-control-disabled disabled:text-foreground-muted",
    "aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive",
  ],
  {
    variants: {
      size: {
        sm: "h-control-sm px-2",
        md: "h-control-md px-2.5",
        lg: "h-control-lg px-3",
      },
    },
    defaultVariants: { size: "md" },
  },
);

// Only text entries: `:read-only` also matches <select> and checkboxes.
const READ_ONLY = "read-only:bg-background-muted";

type ControlSize = VariantProps<typeof controlVariants>["size"];

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: ControlSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, size, ...props }, ref) {
  return <input ref={ref} className={cn(controlVariants({ size }), READ_ONLY, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(controlVariants(), READ_ONLY, "h-auto min-h-control-lg resize-y px-2.5 py-2", className)}
        {...props}
      />
    );
  },
);

export interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: ControlSize;
}

/**
 * A styled native `<select>`: works without JavaScript inside server-action
 * forms and gets the platform picker on mobile for free. A custom listbox
 * (Radix Select / Combobox) is only justified when options need search or
 * rich content (docs/ui/COMPONENTS.md).
 */
export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(function NativeSelect(
  { className, size, children, ...props },
  ref,
) {
  return (
    <span className="relative inline-flex w-full">
      <select
        ref={ref}
        className={cn(controlVariants({ size }), "cursor-pointer appearance-none pr-8", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-foreground-lighter"
      />
    </span>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "size-4 shrink-0 cursor-pointer rounded-sm border-border-control accent-primary focus-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
