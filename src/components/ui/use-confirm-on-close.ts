"use client";

import { useCallback, useState } from "react";

export interface UseConfirmOnCloseResult {
  /** Wire to the Cancel button and to any bespoke close affordance. */
  confirmOnClose: () => void;
  /** Wire directly to the Dialog/Sheet's `onOpenChange`. */
  handleOpenChange: (open: boolean) => void;
  /** Spread onto `<DiscardChangesDialog {...modalProps} />`. */
  modalProps: {
    open: boolean;
    onKeepEditing: () => void;
    onDiscard: () => void;
  };
}

/**
 * Dirty-form dismissal (docs/ui/COMPONENTS.md, `DiscardChangesDialog`):
 * closing a Dialog/Sheet with unsaved changes asks first. Every normal
 * dismissal path — backdrop click, `Esc`, the close icon, a footer
 * "Cancelar" routed through `confirmOnClose` — goes through the same
 * check, so none of them can bypass it.
 *
 * This hook does not own the Dialog/Sheet's `open` state — the caller
 * does, and only flips it via the `onClose` given here (after confirming,
 * or immediately when the form isn't dirty).
 */
export function useConfirmOnClose({
  checkIsDirty,
  onClose,
}: {
  checkIsDirty: () => boolean;
  onClose: () => void;
}): UseConfirmOnCloseResult {
  const [confirmVisible, setConfirmVisible] = useState(false);

  const confirmOnClose = useCallback(() => {
    if (checkIsDirty()) {
      setConfirmVisible(true);
      return;
    }
    onClose();
  }, [checkIsDirty, onClose]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        confirmOnClose();
      }
    },
    [confirmOnClose],
  );

  return {
    confirmOnClose,
    handleOpenChange,
    modalProps: {
      open: confirmVisible,
      onKeepEditing: () => setConfirmVisible(false),
      onDiscard: () => {
        setConfirmVisible(false);
        onClose();
      },
    },
  };
}
