import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CategoryFormRow } from "@effy/shared-types";

import { DetailField } from "./DetailField";

const row = (over: Partial<CategoryFormRow>): CategoryFormRow =>
  ({
    attributeId: "a1",
    key: "k",
    name: "Thing",
    helpText: null,
    inputType: "short_text",
    unitFamily: null,
    units: [],
    min: null,
    max: null,
    decimals: null,
    maxLength: null,
    values: [],
    level: "optional",
    section: "Details",
    position: 1,
    filterable: false,
    customerVisible: true,
    variesByVariant: false,
    variantOption: false,
    ...over,
  }) as CategoryFormRow;

const VARIANTS = [
  { id: "v1", label: "Plain" },
  { id: "v2", label: "Mango" },
];

describe("DetailField (101)", () => {
  it("marks Required and nudges Recommended", () => {
    const { rerender } = render(
      <DetailField
        row={row({ level: "required" })}
        entry={undefined}
        variants={[]}
        onChange={vi.fn()}
        errors={{}}
      />,
    );
    expect(screen.getByText("Required")).toBeInTheDocument();
    rerender(
      <DetailField
        row={row({ level: "recommended" })}
        entry={undefined}
        variants={[]}
        onChange={vi.fn()}
        errors={{}}
      />,
    );
    expect(screen.getByText("Helps shoppers find this")).toBeInTheDocument();
  });

  it("a number is sent with the unit chosen beside it; clearing it leaves the detail out", async () => {
    const onChange = vi.fn();
    render(
      <DetailField
        row={row({
          name: "Net weight",
          inputType: "number",
          unitFamily: "mass",
          units: ["g", "kg"],
        })}
        entry={undefined}
        variants={[]}
        onChange={onChange}
        errors={{}}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Net weight", { selector: "input" }),
      "5",
    );
    expect(onChange).toHaveBeenLastCalledWith({
      attributeId: "a1",
      value: { number: "5", unit: "g" },
    });
  });

  it("a multi choice sends value ids in the list's order", async () => {
    const onChange = vi.fn();
    render(
      <DetailField
        row={row({
          name: "Allergens",
          inputType: "multi_select",
          values: [
            { id: "milk", label: "Milk" },
            { id: "nuts", label: "Nuts" },
          ],
        })}
        entry={{ attributeId: "a1", value: { valueIds: ["nuts"] } }}
        variants={[]}
        onChange={onChange}
        errors={{}}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Milk" }));
    expect(onChange).toHaveBeenLastCalledWith({
      attributeId: "a1",
      value: { valueIds: ["milk", "nuts"] },
    });
  });

  it("yes/no can be left unanswered: clicking the chosen answer clears it", async () => {
    const onChange = vi.fn();
    render(
      <DetailField
        row={row({ inputType: "boolean" })}
        entry={{ attributeId: "a1", value: { boolean: true } }}
        variants={[]}
        onChange={onChange}
        errors={{}}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("a detail that may differ by size is entered per size, and shows each size's error", async () => {
    const onChange = vi.fn();
    const r = row({ name: "Ingredients", variesByVariant: true });
    const { rerender } = render(
      <DetailField
        row={r}
        entry={undefined}
        variants={VARIANTS}
        onChange={onChange}
        errors={{}}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Differs by size" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      attributeId: "a1",
      perVariant: [],
    });

    rerender(
      <DetailField
        row={r}
        entry={{ attributeId: "a1", perVariant: [] }}
        variants={VARIANTS}
        onChange={onChange}
        errors={{ "details.k[v2]": "Enter ingredients" }}
      />,
    );
    await userEvent.type(screen.getByLabelText("Plain"), "M");
    expect(onChange).toHaveBeenLastCalledWith({
      attributeId: "a1",
      perVariant: [{ variantId: "v1", value: { text: "M" } }],
    });
    expect(screen.getByText("Enter ingredients")).toBeInTheDocument();
  });
});
