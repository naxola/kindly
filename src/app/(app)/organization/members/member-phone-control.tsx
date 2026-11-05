"use client";

import { useState } from "react";
import { updateMemberPhoneAction } from "@/modules/organizations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/**
 * Inline phone editor for a member row. Shown only when the viewer may edit
 * it (their own, or any if ADMIN); otherwise the page renders plain text.
 * Errors come back as values (a thrown Server Action error is redacted in
 * production), and are toasted so the field keeps what was typed.
 */
export function MemberPhoneControl({
  userId,
  memberName,
  currentPhone,
}: {
  userId: string;
  memberName: string;
  currentPhone: string | null;
}) {
  const [value, setValue] = useState(currentPhone ?? "");
  const [pending, setPending] = useState(false);
  const dirty = value.trim() !== (currentPhone ?? "");

  async function save() {
    setPending(true);
    try {
      const result = await updateMemberPhoneAction(userId, value);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Teléfono actualizado");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) {
          void save();
        }
      }}
    >
      <Input
        type="tel"
        aria-label={`Teléfono de ${memberName}`}
        placeholder="+34600111222"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-44"
      />
      <Button type="submit" size="sm" disabled={!dirty || pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
