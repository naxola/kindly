"use client";

import { useTransition } from "react";

/**
 * Wraps a Server Action so its Sheet/Dialog closes automatically once it
 * resolves — the create-then-close pattern every "alta" form needs
 * (docs/ui/LAYOUT_NAVIGATION.md §5, rule 3: creating opens a Sheet/Dialog,
 * it doesn't sit permanently over the list). `useFormStatus` inside the
 * form still reports pending correctly: React tracks a form's pending
 * state the same way whether its `action` is a Server Action reference or,
 * as here, a plain client function.
 *
 * Errors are not caught here: a thrown Server Action surfaces exactly as
 * it already does today outside a Sheet (no inline recovery in this pass —
 * a documented gap, not a regression).
 */
export function useCloseAfterAction(
  action: (formData: FormData) => Promise<void>,
  onClose: () => void,
): (formData: FormData) => void {
  const [, startTransition] = useTransition();
  return (formData: FormData) => {
    startTransition(async () => {
      await action(formData);
      onClose();
    });
  };
}
