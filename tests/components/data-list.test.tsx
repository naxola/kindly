// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataList, type DataListItem } from "@/components/ui/data-list";

interface Row extends DataListItem {
  name: string;
}

const rows: Row[] = [
  { key: "1", href: "/inbox/1", name: "Ada" },
  { key: "2", href: "/inbox/2", name: "Grace" },
  { key: "3", href: "/inbox/3", name: "Katherine" },
];

function renderList() {
  return render(
    <DataList
      items={rows}
      aria-label="Conversaciones"
      renderItem={(row) => row.name}
    />,
  );
}

describe("DataList", () => {
  it("has a single tab stop: only the active row is tabbable", () => {
    renderList();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.tabIndex)).toEqual([0, -1, -1]);
  });

  it("moves the roving tab stop with ArrowDown/ArrowUp and J/K", async () => {
    const user = userEvent.setup();
    renderList();
    const [first, second, third] = screen.getAllByRole("link");

    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    expect(first.tabIndex).toBe(-1);
    expect(second.tabIndex).toBe(0);

    await user.keyboard("k");
    expect(first).toHaveFocus();

    await user.keyboard("{End}");
    expect(third).toHaveFocus();

    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
  });

  it("does not move past the first or last row", async () => {
    const user = userEvent.setup();
    renderList();
    const [first, , third] = screen.getAllByRole("link");

    first.focus();
    await user.keyboard("{ArrowUp}");
    expect(first).toHaveFocus();

    third.focus();
    await user.keyboard("{ArrowDown}");
    expect(third).toHaveFocus();
  });

  it("keeps the roving tab stop on the row the user focused after items are replaced (polling)", () => {
    const { rerender } = renderList();
    const second = screen.getAllByRole("link")[1];
    second.focus();

    // Same shape, new array identity — as a poll would deliver.
    rerender(
      <DataList
        items={rows.map((row) => ({ ...row }))}
        aria-label="Conversaciones"
        renderItem={(row) => row.name}
      />,
    );

    expect(screen.getAllByRole("link").map((link) => link.tabIndex)).toEqual([-1, 0, -1]);
  });
});
