import { cn } from "@/lib/cn";

const SIZES = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-6",
} as const;

/**
 * Indeterminate progress. Decorative by default (the owning control carries
 * `aria-busy` and the label); pass `label` when the spinner stands alone.
 */
export function Spinner({
  size = "md",
  label,
  className,
}: {
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}) {
  return (
    <span role={label ? "status" : undefined} className={cn("inline-flex", className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className={cn("animate-spin text-current", SIZES[size])}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
