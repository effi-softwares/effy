import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AttributeField } from "./AttributeField";
import type { ProductTypeAttribute } from "./model";

function attr(over: Partial<ProductTypeAttribute>): ProductTypeAttribute {
  return {
    attributeId: "a1",
    key: "k1",
    name: "Spice level",
    dataType: "short_text",
    unit: null,
    helpText: null,
    validation: null,
    allowedValues: [],
    isMandatory: false,
    displayOrder: 0,
    groupLabel: null,
    ...over,
  };
}

// T049: the renderer maps each AttributeDataType to the right control (input/textarea/number/switch/
// select/checkbox-group), from the schema alone.
describe("AttributeField data-type → control mapping", () => {
  const noop = vi.fn();

  it("short_text → a text input", () => {
    render(<AttributeField attr={attr({ dataType: "short_text" })} value={undefined} onChange={noop} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("long_text → a textarea", () => {
    render(<AttributeField attr={attr({ dataType: "long_text" })} value={{ text: "x" }} onChange={noop} />);
    expect((screen.getByRole("textbox") as HTMLElement).tagName).toBe("TEXTAREA");
  });

  it("number → a numeric input", () => {
    render(<AttributeField attr={attr({ dataType: "number" })} value={undefined} onChange={noop} />);
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });

  it("boolean → a switch", () => {
    render(<AttributeField attr={attr({ dataType: "boolean" })} value={{ boolean: true }} onChange={noop} />);
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("single_select (small) → radios from allowedValues", () => {
    render(
      <AttributeField
        attr={attr({
          dataType: "single_select",
          allowedValues: [
            { id: "1", value: "mild", label: "Mild", displayOrder: 0 },
            { id: "2", value: "hot", label: "Hot", displayOrder: 1 },
          ],
        })}
        value={undefined}
        onChange={noop}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("Mild")).toBeInTheDocument();
  });

  it("multi_select → a checkbox group from allowedValues", () => {
    render(
      <AttributeField
        attr={attr({
          dataType: "multi_select",
          allowedValues: [
            { id: "1", value: "nuts", label: "Nuts", displayOrder: 0 },
            { id: "2", value: "dairy", label: "Dairy", displayOrder: 1 },
          ],
        })}
        value={{ options: ["nuts"] }}
        onChange={noop}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("shows the unit, help text, and a mandatory marker", () => {
    render(
      <AttributeField
        attr={attr({ unit: "g", helpText: "Net weight", isMandatory: true, name: "Weight" })}
        value={undefined}
        onChange={noop}
      />,
    );
    expect(screen.getByText("(g)")).toBeInTheDocument();
    expect(screen.getByText("Net weight")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
  });
});
