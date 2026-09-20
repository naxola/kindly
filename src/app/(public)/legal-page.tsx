import type { ReactNode } from "react";
import { company } from "@/config/company";

/**
 * Shell for the legal documents. They are set in the serif — the same face
 * the product uses for the copilot's drafts and citations — because that is
 * this site's voice for anything with legal weight.
 */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-14 lg:py-20">
      <header className="border-b border-line pb-8">
        <h1 className="headline text-[1.8rem] text-ink sm:text-[2.1rem] lg:text-[2.5rem]">{title}</h1>
        <p className="mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-ink-soft">{summary}</p>
        <p className="mt-5 text-[13px] text-ink-faint">
          Última actualización: {company.legalUpdatedAt}. Responsable: {company.legalName}.
        </p>
      </header>

      <div className="legal-prose mt-2 text-[15.5px]">{children}</div>
    </article>
  );
}
