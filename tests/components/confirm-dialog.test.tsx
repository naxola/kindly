// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * A thin controlled wrapper — ConfirmDialog itself doesn't own `open`, the
 * caller does (docs/ui/COMPONENTS.md), so tests need one too.
 */
function Harness({
  onConfirm,
  confirmText,
}: {
  onConfirm: () => Promise<void> | void;
  confirmText?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Revocar invitación"
      description="El enlace dejará de funcionar."
      confirmLabel="Revocar invitación"
      variant="danger"
      confirmText={confirmText}
      onConfirm={onConfirm}
    />
  );
}

describe("ConfirmDialog", () => {
  it("Esc cancels (closes the dialog) when nothing is pending", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    expect(screen.getByRole("dialog", { name: "Revocar invitación" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("moves focus inside the dialog as soon as it opens", async () => {
    const user = userEvent.setup();
    function TriggerHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Revocar</button>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Revocar invitación"
            confirmLabel="Revocar invitación"
            variant="danger"
            onConfirm={() => {}}
          />
        </>
      );
    }
    render(<TriggerHarness />);

    await user.click(screen.getByRole("button", { name: "Revocar" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    // Focus-return to the trigger on close is Radix's own FocusScope
    // behavior (not something this component implements) and is covered by
    // real-browser E2E instead — jsdom's focus timing for it is unreliable.
  });

  it("shows loading, blocks Esc, and disables Cancel while onConfirm is pending", async () => {
    const user = userEvent.setup();
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (resolveConfirm = resolve)));
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Revocar invitación" }));
    const confirmButton = await screen.findByRole("button", { name: /Revocar invitación/ });
    expect(confirmButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible(); // still open — Esc was blocked

    resolveConfirm();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the thrown error inline and keeps the dialog open", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error("El enlace ya había caducado."));
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Revocar invitación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El enlace ya había caducado.");
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("confirmText keeps the confirm button disabled until the exact text is typed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} confirmText="gestoria-martin" />);

    const confirmButton = screen.getByRole("button", { name: "Revocar invitación" });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByRole("textbox");
    await user.type(input, "gestoria-mar");
    expect(confirmButton).toBeDisabled();

    await user.type(input, "tin");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
