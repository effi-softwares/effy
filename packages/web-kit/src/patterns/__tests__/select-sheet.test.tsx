import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui";

// The shared Select on a phone: the same parts open a bottom sheet of rows instead of the dropdown.
const width = window.innerWidth;
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  for (const m of ["hasPointerCapture", "setPointerCapture", "releasePointerCapture"] as const) {
    if (!(m in Element.prototype)) Object.defineProperty(Element.prototype, m, { value: () => false, writable: true });
  }
  // jsdom computes no transform; vaul reads one when a tap inside the sheet ends.
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
    const style = computed(el, pseudo);
    return style.transform ? style : Object.assign(style, { transform: "none" });
  });
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => {}, writable: true });
  }
});
afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  vi.restoreAllMocks();
});

function Fruit({ onChange, items = ["Apple", "Pear", "Plum"] }: { onChange: (v: string) => void; items?: string[] }) {
  return (
    <>
      <Label htmlFor="fruit">Fruit</Label>
      <Select defaultValue="Apple" onValueChange={onChange}>
        <SelectTrigger id="fruit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i} value={i}>
              {i}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

describe("Select on a phone", () => {
  it("opens a sheet titled by the field's label, and one tap chooses", async () => {
    const onChange = vi.fn();
    render(<Fruit onChange={onChange} />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Apple");

    await userEvent.click(trigger);
    const list = await screen.findByRole("listbox", { name: "Fruit" });
    expect(within(list).getByRole("option", { name: "Apple" })).toHaveAttribute("aria-selected", "true");

    await userEvent.click(within(list).getByRole("option", { name: "Plum" }));
    expect(onChange).toHaveBeenCalledWith("Plum");
    expect(trigger).toHaveTextContent("Plum");
  });

  it("offers a search on a long list", async () => {
    const items = ["Apple", "Apricot", "Banana", "Cherry", "Date", "Fig", "Grape", "Kiwi", "Lemon", "Mango"];
    render(<Fruit onChange={() => undefined} items={items} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.type(await screen.findByRole("searchbox"), "ap");
    const list = screen.getByRole("listbox", { name: "Fruit" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Apple", "Apricot", "Grape"]);
  });
});
