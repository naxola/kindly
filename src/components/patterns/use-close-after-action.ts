"use client";

import { useTransition } from "react";
import { toast } from "@/components/ui/toast";

/**
 * What an action may hand back for the UI: `error` keeps the Sheet/Dialog
 * open and is toasted (a thrown Server Action error is redacted in
 * production, so expected failures travel as values); `warning` closes it
 * but tells the user something partial happened (e.g. record created, email
 * not sent).
 */
export interface ActionFeedback {
  error?: string;
  warning?: string;
}

/**
 * Wraps a Server Action so its Sheet/Dialog closes automatically once it
 * resolves — the create-then-close pattern every "alta" form needs
 * (docs/ui/LAYOUT_NAVIGATION.md §5, rule 3: creating opens a Sheet/Dialog,
 * it doesn't sit permanently over the list). `useFormStatus` inside the
 * form still reports pending correctly: React tracks a form's pending
 * state the same way whether its `action` is a Server Action reference or,
 * as here, a plain client function.
 *
 * Thrown errors are not caught here: they surface exactly as they do
 * outside a Sheet. Expected failures should be returned as `ActionFeedback`.
 */
export function useCloseAfterAction(
  action: (formData: FormData) => Promise<ActionFeedback | void>,
  onClose: () => void,
): (formData: FormData) => void {
  const [, startTransition] = useTransition();
  return (formData: FormData) => {
    startTransition(async () => {
      const feedback = await action(formData);
      if (feedback?.error) {
        toast.error(feedback.error);
        return;
      }
      if (feedback?.warning) {
        toast.warning(feedback.warning);
      }
      onClose();
    });
  };
}
