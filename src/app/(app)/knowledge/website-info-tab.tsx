import { ExternalLink } from "lucide-react";
import { formatDay, DISCOVERY_SOURCE_LABELS } from "@/app/(app)/knowledge/labels";
import { SiteThumbnail } from "@/app/(app)/knowledge/site-thumbnail";
import type { WebsiteView } from "@/app/(app)/knowledge/website-sheet";
import { Badge } from "@/components/ui/badge";
import { summarizeWebsite } from "@/modules/knowledge/source-status";

const day = (iso: string | null) => (iso ? formatDay(iso.slice(0, 10)) : "—");

export function WebsiteInfoTab({ website }: { website: WebsiteView }) {
  const host = new URL(website.url).host;
  const summary = summarizeWebsite(website.pages);

  return (
    <div className="flex flex-col gap-4">
      <SiteThumbnail imageUrl={website.imageUrl} host={host} />

      <dl className="type-body flex flex-col gap-3">
        <div>
          <dt className="text-foreground-lighter">Dirección</dt>
          <dd className="font-medium text-foreground">
            <a
              href={website.url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1 rounded-sm underline"
            >
              {website.url}
              <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">(se abre en una pestaña nueva)</span>
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-foreground-lighter">Páginas encontradas en</dt>
          <dd className="text-foreground">{DISCOVERY_SOURCE_LABELS[website.discoverySource]}</dd>
        </div>
        <div>
          <dt className="text-foreground-lighter">Páginas</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            <Badge tone="neutral">{summary.total} encontradas</Badge>
            <Badge tone="success">{summary.indexed} indexadas</Badge>
            {summary.waiting > 0 && <Badge tone="info">{summary.waiting} en curso</Badge>}
            {summary.failed > 0 && <Badge tone="destructive">{summary.failed} con error</Badge>}
          </dd>
        </div>
        <div>
          <dt className="text-foreground-lighter">Añadido</dt>
          <dd className="text-foreground">{day(website.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-foreground-lighter">Última búsqueda de páginas</dt>
          <dd className="text-foreground">{day(website.discoveredAt)}</dd>
        </div>
      </dl>

      <p className="type-body text-foreground-lighter">
        Elige qué páginas indexar en la pestaña «Páginas». Cada una se añade a la base de conocimiento de tu organización
        como un documento, con su fuente y vigencia. Solo se guarda el texto, no la página.
      </p>
    </div>
  );
}
