"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Load error (docs/ui/INBOX.md §6): Next.js's error boundary for this route. */
export default function InboxError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer size="full">
      <PageHeader title="Inbox" />
      <Alert tone="destructive" live title="No se pudo cargar la bandeja" actions={<Button onClick={reset}>Reintentar</Button>}>
        Vuelve a intentarlo en un momento. Si el problema sigue, avisa al equipo técnico.
      </Alert>
    </PageContainer>
  );
}
