import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";

/**
 * "Contacto no identificado" (docs/PRODUCT.md sección 4), in the ficha's
 * "Identificación" section (UI-10a, `docs/ui/CONVERSATION_WORKSPACE.md` §3).
 * Its two native `<form>`s take whatever action the caller passes — the
 * Inbox panel wraps the Server Actions so it can reload its own data after.
 */
export function IdentificationSection({
  otherContacts,
  markContactIdentified,
  reassignConversation,
}: {
  otherContacts: { id: string; name: string }[];
  markContactIdentified: () => Promise<void>;
  reassignConversation: (formData: FormData) => Promise<void>;
}) {
  return (
    <Alert
      tone="warning"
      title="Contacto no identificado"
      actions={
        <>
          <form action={markContactIdentified}>
            <Button type="submit" size="sm">
              Marcar como identificado
            </Button>
          </form>
          {otherContacts.length > 0 && (
            <form action={reassignConversation} className="flex items-center gap-2">
              <NativeSelect name="targetContactId" aria-label="Reasignar a" className="w-auto" defaultValue="">
                <option value="" disabled>
                  Reasignar a...
                </option>
                {otherContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" size="sm" variant="outline">
                Reasignar
              </Button>
            </form>
          )}
        </>
      }
    >
      Creado automáticamente a partir de este mensaje.
    </Alert>
  );
}
