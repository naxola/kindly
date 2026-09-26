import type { ReactNode } from "react";

/** Shared by the static and interactive halves of `/ui-kit`. */
export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`kit-${title}`}>
      <div>
        <h2 id={`kit-${title}`} className="type-section-title">
          {title}
        </h2>
        {description && <p className="type-body text-foreground-lighter">{description}</p>}
      </div>
      {children}
    </section>
  );
}
