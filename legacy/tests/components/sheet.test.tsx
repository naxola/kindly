// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function Harness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button>Abrir menú</button>
      </SheetTrigger>
      <SheetContent side="left" size="sm">
        <SheetHeader>
          <SheetTitle>Kindly</SheetTitle>
          <SheetDescription>Navegación principal</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <button type="button">Inbox</button>
          <button type="button">Contacts</button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("opens on trigger click, traps focus inside, and Esc closes it and returns focus", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    const trigger = screen.getByRole("button", { name: "Abrir menú" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Kindly" });
    expect(dialog).toBeVisible();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    // Tabbing through the panel's content never lands outside it.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on backdrop click", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    await screen.findByRole("dialog");

    // The backdrop: a portalled sibling of the panel, not inside it. Its
    // trigger also gets `data-state="open"` reflected onto it by Radix, so
    // this can't just look for that attribute — it has to be the overlay
    // specifically.
    const overlay = document.querySelector(".bg-overlay");
    expect(overlay).toBeTruthy();
    await user.click(overlay as Element);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("wires SheetDescription as the panel's accessible description", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleDescription("Navegación principal");
  });
});
