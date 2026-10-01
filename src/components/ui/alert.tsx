import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Inline callout (Supabase's Admonition): explains a condition *in place*,
 * where the user feels its effect — a closed service window above the
 * composer, an unidentified contact above the thread, a provider error on
 * the channel card. It is not a toast and does not go away by itself.
 */
const alertVariants = cva("flex gap-3 rounded-card border px-3.5 py-3 type-body", {
  variants: {
    tone: {
      info: "border-info-border bg-info-soft text-info-soft-foreground",
      success: "border-success-border bg-success-soft text-success-soft-foreground",
      warning: "border-warning-border bg-warning-soft text-warning-soft-foreground",
      destructive: "border-destructive-border bg-destructive-soft text-destructive-soft-foreground",
      neutral: "border-border bg-background-muted text-foreground-light",
    },
  },
  defaultVariants: { tone: "info" },
});

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: OctagonAlert,
  neutral: Info,
} as const;

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof alertVariants> {
  title?: ReactNode;
  /** Buttons or links that resolve the condition. */
  actions?: ReactNode;
  /**
   * `true` only for content that appears as the result of the user's own
   * action (a failed submit): it is announced immediately. Static page
   * context must not use it, or every page load interrupts the reader.
   */
  live?: boolean;
}

export function Alert({ className, tone, title, actions, live = false, children, ...props }: AlertProps) {
  const Icon = ICONS[tone ?? "info"];
  return (
    <div
      role={live ? (tone === "destructive" ? "alert" : "status") : undefined}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="flex flex-col gap-1 [&_a]:underline">{children}</div>}
        {actions && <div className="mt-1.5 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
