"use client";

import { useRouter } from "next/navigation";
import type { WebsiteDiscoverySource, WebsiteOptions } from "@/modules/knowledge/schema";
import { summarizeWebsite, type WebsitePageState } from "@/modules/knowledge/source-status";
import { useWebsiteImport } from "@/app/(app)/knowledge/use-website-import";
import { WebsiteInfoTab } from "@/app/(app)/knowledge/website-info-tab";
import { WebsitePagesTab } from "@/app/(app)/knowledge/website-pages-tab";
import { WebsiteSettingsTab } from "@/app/(app)/knowledge/website-settings-tab";
import { Alert } from "@/components/ui/alert";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface WebsitePageView {
  id: string;
  url: string;
  title: string | null;
  lastModified: string | null;
  status: WebsitePageState;
  error: string | null;
  documentId: string | null;
}

/** Plain, serializable view of a website for the client panel (dates as ISO strings). */
export interface WebsiteView {
  id: string;
  url: string;
  title: string | null;
  imageUrl: string | null;
  discoverySource: WebsiteDiscoverySource;
  discoveredAt: string | null;
  createdAt: string;
  options: WebsiteOptions;
  pages: WebsitePageView[];
}

export type WebsiteTab = "informacion" | "paginas" | "configuracion";

/**
 * The panel of a website source (right-hand Sheet): Información, Páginas and
 * Configuración. Open while `?sitio=<id>` is in the address; closing it
 * removes that parameter. While pages are queued it keeps indexing them.
 */
export function WebsiteSheet({ website, initialTab }: { website: WebsiteView; initialTab: WebsiteTab }) {
  const router = useRouter();
  const importError = useWebsiteImport(website.id, summarizeWebsite(website.pages).waiting);
  const host = new URL(website.url).host;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.replace("/knowledge", { scroll: false });
      }}
    >
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>{website.title ?? host}</SheetTitle>
          <SheetDescription>{host}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {importError && (
            <Alert tone="destructive" title="La indexación se ha detenido" className="mb-4">
              {importError}
            </Alert>
          )}
          <Tabs defaultValue={initialTab}>
            <TabsList>
              <TabsTrigger value="informacion">Información</TabsTrigger>
              <TabsTrigger value="paginas">Páginas</TabsTrigger>
              <TabsTrigger value="configuracion">Configuración</TabsTrigger>
            </TabsList>
            <TabsContent value="informacion">
              <WebsiteInfoTab website={website} />
            </TabsContent>
            <TabsContent value="paginas" forceMount className="data-[state=inactive]:hidden">
              <WebsitePagesTab websiteId={website.id} pages={website.pages} />
            </TabsContent>
            <TabsContent value="configuracion">
              <WebsiteSettingsTab website={website} />
            </TabsContent>
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
