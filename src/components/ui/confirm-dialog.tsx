"use client";

import { useId, useState, type ReactNode } from "react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export interface ConfirmDialogProps {
  open: boolean;
  /** Called on cancel, `Esc`, backdrop click and the close button — never while `onConfirm` is pending. */
  onOpenChange: (open: boolean) => void;
  /** Repeats the action ("Revocar invitación"), not a generic "¿Estás seguro?". */
  title: ReactNode;
  /** The consequence, in one short sentence. */
  description?: ReactNode;
  /** Extra context: callouts, a summary of what's affected. */
  children?: ReactNode;
  confirmLabel: string;
  /** Defaults to `confirmLabel`, shown next to the spinner while pending. */
  confirmLoadingLabel?: string;
  cancelLabel?: string;
  /** `danger` for destructive actions (delete, revoke, disconnect). */
  variant?: "default" | "danger";
  /**
   * Exact text the user must type to enable confirm — the deliberate speed
   * bump for actions too destructive for a single click (Supabase's
   * TextConfirmDialog). Omit for anything reversible or already explained
   * by `description`.
   */
  confirmText?: string;
  /** May throw; its message is shown inline and the dialog stays open. */
  onConfirm: () => Promise<void> | void;
  /** Toasted after a successful confirm, once the dialog has closed. */
  successMessage?: string;
}

/**
 * The only confirmation dialog in the app (docs/ui/COMPONENTS.md §4: "no
 * se crean diálogos por caso"). Every destructive or consequential action —
 * revoke, disconnect, change a role — opens this, parametrized, instead of
 * a bespoke dialog.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  confirmLoadingLabel,
  cancelLabel = "Cancelar",
  variant = "default",
  confirmText,
  onConfirm,
  successMessage,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedText, setTypedText] = useState("");
  const confirmInputId = useId();

  // Fresh state every time it opens, so a previous error/typed text never
  // leaks into the next confirmation. Adjusted during render (React's
  // documented pattern for this) rather than in an effect, which would
  // cost an extra render and briefly show the stale error.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setTypedText("");
    }
  }

  const textConfirmed = !confirmText || typedText === confirmText;

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      onOpenChange(false);
      if (successMessage) {
        toast.success(successMessage);
      }
    } catch (thrown) {
      setPending(false);
      setError(thrown instanceof Error ? thrown.message : "No se pudo completar la acción.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) {
          return; // Block cancellation while the action is running.
        }
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm" onEscapeKeyDown={(event) => pending && event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {(children || confirmText || error) && (
          <DialogBody>
            {children}
            {confirmText && (
              <Field
                label={
                  <>
                    Escribe <span className="font-mono">{confirmText}</span> para confirmar
                  </>
                }
              >
                <Input
                  id={confirmInputId}
                  value={typedText}
                  onChange={(event) => setTypedText(event.target.value)}
                  placeholder={confirmText}
                  autoComplete="off"
                  disabled={pending}
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="type-caption text-destructive-soft-foreground">
                {error}
              </p>
            )}
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="default" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={() => void handleConfirm()}
            loading={pending}
            loadingText={confirmLoadingLabel ?? confirmLabel}
            disabled={!textConfirmed}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
