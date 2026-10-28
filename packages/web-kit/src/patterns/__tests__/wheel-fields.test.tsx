import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DateField, Label, TimeField } from "@effy/design-system/ui";

// On a phone the time and date fields are buttons that open a sheet of wheels; Done hands the value back.
const width = window.innerWidth;
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  for (const m of ["hasPointerCapture", "setPointerCapture", "releasePointerCapture"] as const) {
    if (!(m in Element.prototype)) Object.defineProperty(Element.prototype, m, { value: () => false, writable: true });
  }
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
    const style = computed(el, pseudo);
    return style.transform ? style : Object.assign(style, { transform: "none" });
  });
});
afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  vi.restoreAllMocks();
});

describe("Time and date fields on a phone", () => {
  it("says the time in words and opens a sheet titled by its label; Done keeps it", async () => {
    const onChange = vi.fn();
    render(
      <>
        <Label htmlFor="cutoff">Cutoff</Label>
        <TimeField id="cutoff" value="13:45" onChange={onChange} />
      </>,
    );
    const field = screen.getByRole("button", { name: /Cutoff/ });
    expect(field).toHaveTextContent("1:45 pm");
    await userEvent.click(field);
    expect(await screen.findByText("Cutoff", { selector: "[data-slot=drawer-title]" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledWith("13:45");
  });

  it("starts an empty date on today, and hands it back as YYYY-MM-DD", async () => {
    const onChange = vi.fn();
    render(<DateField aria-label="Registration expires" value="" onChange={onChange} />);
    const field = screen.getByRole("button", { name: "Registration expires" });
    expect(field).toHaveTextContent("Choose a date");
    await userEvent.click(field);
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(onChange).toHaveBeenCalledWith(today);
  });

  it("shows a set date in words", () => {
    render(<DateField aria-label="Started" value="2026-10-28" onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Started" })).toHaveTextContent("28 Oct 2026");
  });
});
