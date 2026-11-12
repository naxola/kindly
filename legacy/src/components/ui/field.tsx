import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("type-label text-foreground", className)} {...props} />;
}

interface ControlA11yProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
}

/**
 * Label + control + description + error, wired for assistive technology:
 * the label targets the control, the description and error are announced
 * with it, and `aria-invalid` drives the control's error styling.
 *
 * Takes exactly one control as child and injects the ids, so call sites
 * never hand-write `htmlFor`/`aria-describedby` (docs/ui/COMPONENTS.md,
 * Forms). Supabase's FormItemLayout, without react-hook-form: our forms are
 * server actions.
 */
export function Field({
  label,
  description,
  error,
  optional = false,
  layout = "vertical",
  className,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  /** Marks the field as optional in the label (required is the default). */
  optional?: boolean;
  /** `horizontal` puts label and description beside the control (settings). */
  layout?: "vertical" | "horizontal";
  className?: string;
  children: ReactElement<ControlA11yProps>;
}) {
  const generatedId = useId();
  const control = Children.only(children);
  const controlId = (isValidElement(control) && control.props.id) || generatedId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [control.props["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ");

  const wiredControl = cloneElement(control, {
    id: controlId,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : control.props["aria-invalid"],
  });

  const labelBlock = (
    <div className="flex flex-col gap-0.5">
      <Label htmlFor={controlId}>
        {label}
        {optional && <span className="font-normal text-foreground-lighter"> (opcional)</span>}
      </Label>
      {description && layout === "horizontal" && (
        <p id={descriptionId} className="type-caption text-foreground-lighter">
          {description}
        </p>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        layout === "horizontal" ? "grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6" : "flex flex-col gap-1.5",
        className,
      )}
    >
      {labelBlock}
      <div className="flex flex-col gap-1.5">
        {wiredControl}
        {description && layout === "vertical" && (
          <p id={descriptionId} className="type-caption text-foreground-lighter">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} className="type-caption text-destructive-soft-foreground">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
