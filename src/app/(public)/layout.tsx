import type { ReactNode } from "react";
import Link from "next/link";
import { company, hasPlaceholderCompanyData } from "@/config/company";

/**
 * Public site: landing and legal documents. Deliberately outside the `(app)`
 * group, which requires a session — Meta's reviewers and periodic checks
 * must reach the privacy policy with no login and no redirect, or the app
 * gets flagged.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-white text-ink">
      {hasPlaceholderCompanyData() && <PlaceholderBanner />}
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/**
 * Shown while `src/config/company.ts` still holds placeholders. Publishing
 * a legal notice with an invented address is worse than publishing none, so
 * the gap is loud rather than quiet.
 */
function PlaceholderBanner() {
  return (
    <div className="bg-evidence-insufficient px-6 py-2 text-center text-[13px] text-white">
      Sitio sin publicar: faltan los datos legales de la empresa en{" "}
      <code className="font-mono">src/config/company.ts</code>.
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-7 text-[14px]">
          <Link href="/#producto" className="hidden text-ink-soft hover:text-ink sm:block">
            Producto
          </Link>
          <Link href="/#datos" className="hidden text-ink-soft hover:text-ink sm:block">
            Datos y seguridad
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-ink px-3.5 py-2 font-medium text-white hover:bg-ink-soft"
          >
            Entrar
          </Link>
        </nav>
      </div>
    </header>
  );
}

/**
 * The mark is the product's idea in miniature: a line of text with a stamp
 * beside it, the way a filing gets marked as checked.
 */
function Wordmark() {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[19px] font-semibold tracking-[-0.03em] text-ink">Kindly</span>
      <span aria-hidden className="mb-0.5 h-1.5 w-1.5 rounded-full bg-stamp" />
    </span>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Wordmark />
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
              Bandeja unificada, casos y copiloto para despachos y gestorías. El profesional sigue siendo quien
              responde.
            </p>
          </div>

          <div className="flex gap-12 text-[13.5px]">
            <div className="flex flex-col gap-2.5">
              <span className="font-medium text-ink">Legal</span>
              <Link href="/privacidad" className="text-ink-soft hover:text-ink">
                Privacidad
              </Link>
              <Link href="/terminos" className="text-ink-soft hover:text-ink">
                Términos
              </Link>
              <Link href="/aviso-legal" className="text-ink-soft hover:text-ink">
                Aviso legal
              </Link>
              <Link href="/eliminacion-de-datos" className="text-ink-soft hover:text-ink">
                Eliminar mis datos
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-medium text-ink">Contacto</span>
              <a href={`mailto:${company.email}`} className="text-ink-soft hover:text-ink">
                {company.email}
              </a>
              <span className="text-ink-soft">{company.phone}</span>
            </div>
          </div>
        </div>

        <p className="mt-10 border-t border-line pt-6 text-[12.5px] text-ink-faint">
          {company.legalName} · {company.taxId} · {company.address}
        </p>
      </div>
    </footer>
  );
}
