import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A titled block of content within a page (docs/ui/LAYOUT_NAVIGATION.md
 * §5). Used to label each block when a page has no `PageHeader` title, or
 * to split a page's content into named parts.
 */
export function PageSection({
  title,
  description,
  aside,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      {(title || aside) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {title && <h2 className="type-section-title text-foreground">{title}</h2>}
            {description && <p className="type-body text-foreground-lighter">{description}</p>}
          </div>
          {aside && <div className="flex items-center gap-2">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
