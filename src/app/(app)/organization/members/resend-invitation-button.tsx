"use client";

import { useState } from "react";
import { resendInvitationAction } from "@/modules/organizations/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** "Reenviar": emails the same pending invitation link again. */
export function ResendInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    try {
      const result = await resendInvitationAction(invitationId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Invitación reenviada a ${email}`);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={resend} disabled={pending}>
      {pending ? "Enviando…" : "Reenviar"}
    </Button>
  );
}
