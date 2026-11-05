"use client";

import { useState } from "react";
import { Globe } from "lucide-react";

/**
 * Preview of the site's home page: the `og:image` it publishes, shown straight
 * from the site. Not a screenshot (that would need a third-party service or a
 * headless browser), so a site without one — or one that fails to load — gets
 * a plain placeholder instead.
 */
export function SiteThumbnail({ imageUrl, host }: { imageUrl: string | null; host: string }) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-card border border-border bg-background-muted text-foreground-lighter">
        <Globe className="size-8" aria-hidden />
        <span className="type-body">{host}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote image from an arbitrary site: no fixed host to allow in next/image
    <img
      src={imageUrl}
      alt={`Vista previa de ${host}`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded-card border border-border bg-background-muted object-cover"
    />
  );
}
