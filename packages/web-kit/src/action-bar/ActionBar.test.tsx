import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionBarButton, ActionBarProvider, useActionBar } from "./ActionBar";

function Picker({ name, label }: { name: string; label: string }) {
  const [count, setCount] = useState(0);
  const bar = useActionBar({
    count,
    label,
    onClear: () => setCount(0),
    children: <ActionBarButton>{name} action</ActionBarButton>,
  });
  return (
    <>
      <button onClick={() => setCount((n) => n + 1)}>pick {name}</button>
      {bar}
    </>
  );
}

const bars = () => document.querySelectorAll(".ef-selbar");

describe("the console's one action bar (103)", () => {
  it("is one bar for the whole app, hidden until something is chosen", async () => {
    render(
      <ActionBarProvider>
        <Picker name="Orders" label="Selected orders" />
        <Picker name="Stock" label="Selected stock" />
      </ActionBarProvider>,
    );
    expect(bars()).toHaveLength(1);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("pick Orders"));
    await userEvent.click(screen.getByText("pick Orders"));
    const bar = screen.getByRole("region", { name: "Selected orders" });
    expect(bar).toHaveTextContent("2 selected");
    expect(within(bar).getByRole("button", { name: "Orders action" })).toBeInTheDocument();
  });

  it("goes to whoever opened it last, and clears through its owner", async () => {
    render(
      <ActionBarProvider>
        <Picker name="Orders" label="Selected orders" />
        <Picker name="Stock" label="Selected stock" />
      </ActionBarProvider>,
    );
    await userEvent.click(screen.getByText("pick Orders"));
    await userEvent.click(screen.getByText("pick Stock"));
    const bar = screen.getByRole("region", { name: "Selected stock" });
    expect(within(bar).getByRole("button", { name: "Stock action" })).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: "Orders action" })).not.toBeInTheDocument();

    await userEvent.click(within(bar).getByRole("button", { name: "Clear selection" }));
    // Closed, it slides away still showing what it held.
    expect(bars()[0]).toHaveAttribute("data-state", "closed");
    expect(bars()[0]).toHaveTextContent("1 selected");
  });

  it("without a provider, a screen still gets its own bar", async () => {
    render(<Picker name="Orders" label="Selected orders" />);
    await act(async () => {
      await userEvent.click(screen.getByText("pick Orders"));
    });
    expect(screen.getByRole("region", { name: "Selected orders" })).toHaveTextContent("1 selected");
  });
});

describe("the bar is one row, always (103)", () => {
  afterEach(() => vi.restoreAllMocks());

  const widths = (need: number, room: number) => {
    vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(function (this: Element) {
      return this.classList.contains("ef-selbar") ? need : 0;
    });
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) {
      return this.classList.contains("ef-selbar") ? room : 0;
    });
  };

  it("packs tighter, then scrolls its actions, rather than wrapping", async () => {
    widths(1200, 600);
    render(
      <ActionBarProvider>
        <Picker name="Orders" label="Selected orders" />
      </ActionBarProvider>,
    );
    await userEvent.click(screen.getByText("pick Orders"));
    const bar = screen.getByRole("region", { name: "Selected orders" });
    expect(bar).toHaveAttribute("data-density", "scroll");
    // Short of room, the count is just the number; its name stays for assistive tech.
    expect(within(bar).getByLabelText("1 selected")).toHaveTextContent(/^1$/);
    expect(within(bar).getByRole("button", { name: "Orders action" }).className).toContain("h-7");
  });

  it("stays at full size when everything fits", async () => {
    widths(500, 600);
    render(
      <ActionBarProvider>
        <Picker name="Orders" label="Selected orders" />
      </ActionBarProvider>,
    );
    await userEvent.click(screen.getByText("pick Orders"));
    expect(screen.getByRole("region", { name: "Selected orders" })).toHaveAttribute("data-density", "normal");
  });
});
