"use client";

import { useState } from "react";
import { sendContactWelcomeEmailAction } from "@/modules/contacts/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * Welcome-email status + "Enviar/Reenviar" for the current reference
 * delegate. `welcomeSentAt` is an ISO string because it crosses from a
 * Server Component.
 */
export function WelcomeEmailControl({
  contactId,
  contactEmail,
  welcomeSentAt,
}: {
  contactId: string;
  contactEmail: string | null;
  welcomeSentAt: string | null;
}) {
  const [pending, setPending] = useState(false);

  async function send() {
    setPending(true);
    try {
      const result = await sendContactWelcomeEmailAction(contactId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Email de bienvenida enviado");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="type-label text-foreground">Email de bienvenida</p>
      <p className="type-caption text-foreground-lighter">
        {!contactEmail
          ? "El afiliado no tiene email, así que no se le puede enviar."
          : welcomeSentAt
            ? `Enviado a ${contactEmail} el ${new Date(welcomeSentAt).toLocaleDateString("es-ES")}.`
            : `Aún no enviado a ${contactEmail}.`}
      </p>
      {contactEmail && (
        <div>
          <Button size="sm" onClick={send} disabled={pending}>
            {pending ? "Enviando…" : welcomeSentAt ? "Reenviar bienvenida" : "Enviar bienvenida"}
          </Button>
        </div>
      )}
    </div>
  );
}
