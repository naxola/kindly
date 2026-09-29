"use client";

import { useState } from "react";
import { createMembershipAction, endMembershipAction, updateMembershipAction } from "@/modules/memberships/actions";
import { MembershipStatus, type MembershipStatusData } from "@/app/(app)/contacts/membership-status";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

function toDateInputValue(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function toMonthInputValue(iso: string) {
  return iso.slice(0, 7);
}

/**
 * "Afiliación" (UI-10b): alta, edición y baja manual en `/contacts/[id]`.
 * Always an inline form, no separate view/edit mode — same convention as
 * the Contact edit `Card` above it on that page. Alta and "volver a
 * afiliarse" share the same form (`createMembershipAction`) since the
 * domain treats them as the same operation; only the submit label
 * differs. The ficha inside the conversation panel stays read-only
 * (`MembershipStatus` alone, `docs/ui/CONVERSATION_WORKSPACE.md` §5.1).
 */
export function MembershipSection({
  contactId,
  membership,
}: {
  contactId: string;
  membership: MembershipStatusData | null;
}) {
  const [endOpen, setEndOpen] = useState(false);
  const isActive = membership?.status === "ACTIVE";
  const wasAffiliatedBefore = membership !== null;
  const action = isActive ? updateMembershipAction.bind(null, contactId) : createMembershipAction.bind(null, contactId);

  return (
    <div className="flex flex-col gap-4">
      <MembershipStatus membership={membership} />

      <form action={action} className="flex flex-col gap-4">
        <Field label="Número de afiliado" optional>
          <Input type="text" name="memberNumber" defaultValue={membership?.memberNumber ?? ""} />
        </Field>
        <Field label={isActive ? "Afiliado desde" : "Fecha de alta"}>
          <Input
            type="date"
            name="startedAt"
            required
            defaultValue={isActive ? toDateInputValue(membership!.startedAt) : new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Cuota pagada hasta" optional description="Último mes con la cuota abonada.">
          <Input
            type="month"
            name="feePaidUntil"
            defaultValue={membership?.feePaidUntil ? toMonthInputValue(membership.feePaidUntil) : ""}
          />
        </Field>
        <div className="flex gap-2">
          <SubmitButton>{isActive ? "Guardar" : wasAffiliatedBefore ? "Volver a afiliar" : "Dar de alta"}</SubmitButton>
          {isActive && (
            <Button type="button" onClick={() => setEndOpen(true)}>
              Dar de baja
            </Button>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={endOpen}
        onOpenChange={setEndOpen}
        title="Dar de baja la afiliación"
        description="El contacto deja de estar afiliado. Puede volver a afiliarse más adelante sin perder este historial."
        confirmLabel="Dar de baja"
        confirmLoadingLabel="Dando de baja…"
        variant="danger"
        successMessage="Afiliación dada de baja"
        onConfirm={async () => {
          const result = await endMembershipAction(contactId);
          if (result?.error) {
            throw new Error(result.error);
          }
        }}
      />
    </div>
  );
}
