import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  BLOCK_CATALOGUE,
  BLOCK_TYPES,
  type BlockField,
  type BlockType,
  type LayoutBlock,
} from "@effy/shared-types";

import { BlockForm } from "./BlockForm";

const block = (type: string, props: Record<string, unknown> = {}): LayoutBlock => ({
  id: "b1",
  type,
  props,
});

/**
 * ⚠ THE FIRST SUITE IS THE ONE THAT MATTERS, and it guards a silent failure.
 *
 * A block type can be added to the catalogue — where the server validates it, the storefront renders
 * it and the composer offers it in the add menu — and simply have no way to be EDITED. Nothing
 * throws: the operator adds the block, opens it, and there is nothing there. Generating the form from
 * the schema is what makes "the catalogue knows about it" and "the operator can edit it" one fact,
 * and this is what proves the generation actually covers the catalogue.
 */
describe("every block type in the catalogue is editable", () => {
  for (const type of BLOCK_TYPES) {
    const def = BLOCK_CATALOGUE[type];

    it(`renders an editor for ${type}`, () => {
      const { container } = render(<BlockForm block={block(type)} onChange={vi.fn()} />);

      if (def.fields.length === 0) {
        // `recently_viewed` — its content is the shopper's own device history, so only its POSITION
        // is authorable. Saying so beats an empty panel that looks broken.
        expect(container.textContent).toMatch(/nothing to fill in/i);
        return;
      }

      // ⚠ Every TOP-LEVEL field must produce a control. A field the renderer has no case for would
      // render nothing at all, and the operator would never know the field existed.
      for (const field of def.fields) {
        expect(
          screen.queryAllByText(new RegExp(escapeRegExp(field.label), "i")).length,
          `${type}.${field.key} ("${field.label}") produced no control`,
        ).toBeGreaterThan(0);
      }
    });
  }

  it("uses every field kind the catalogue actually declares", () => {
    // If the catalogue starts using a kind the renderer has no case for, the `never` default in
    // FieldEditor makes it a compile error — but only for kinds the union names. This asserts the
    // catalogue has not quietly grown one.
    const used = new Set<string>();
    const walk = (fields: readonly BlockField[]) => {
      for (const f of fields) {
        used.add(f.kind);
        if (f.kind === "list") walk(f.of);
      }
    };
    for (const type of BLOCK_TYPES) walk(BLOCK_CATALOGUE[type].fields);

    const rendered = new Set([
      "text",
      "longText",
      "enum",
      "boolean",
      "reference",
      "destination",
      "artwork",
      "list",
    ]);
    for (const kind of used) {
      expect(rendered, `the form has no case for the "${kind}" field kind`).toContain(kind);
    }
  });
});

describe("editing a field", () => {
  it("reports the whole props object, not just the changed key", async () => {
    // ⚠ A partial update would silently drop every other field on the block. The screen replaces the
    // block's props wholesale, so the form has to hand back a complete object.
    const onChange = vi.fn();
    // ⚠ Radix marks the page inert while a Select is open, which user-event reads as "this element
    // does not accept pointer events" and refuses to click. The check is right about the DOM and
    // wrong about the intent — a real person clicking the option is exactly what this simulates.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <BlockForm
        block={block("app_promo", { headline: "One", supporting: "Two" })}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText(/Headline/i), "!");
    expect(onChange).toHaveBeenLastCalledWith({ headline: "One!", supporting: "Two" });
  });

  it("caps a text field at the length the server enforces", () => {
    render(<BlockForm block={block("app_promo")} onChange={vi.fn()} />);
    const field = BLOCK_CATALOGUE.app_promo.fields.find((f) => f.key === "headline");
    if (field?.kind !== "text") throw new Error("headline must be a text field");
    // ⚠ Advisory only (FR-032) — the operator can reach the API directly, and `layout_field_too_long`
    // is what actually holds. This just stops them writing 200 characters before finding out.
    expect(screen.getByLabelText(/Headline/i)).toHaveAttribute("maxlength", String(field.maxLength));
  });

  it("marks the optional fields rather than the required ones", () => {
    // Most fields are required, so marking those would decorate almost every label and say nothing.
    // The useful signal is which fields can safely be left alone.
    render(<BlockForm block={block("app_promo")} onChange={vi.fn()} />);
    expect(screen.getByText(/Supporting line/i).textContent).toMatch(/optional/i);
    expect(screen.getByText(/Headline/i).textContent).not.toMatch(/optional/i);
  });
});

describe("a closed set is presented as one", () => {
  it("offers tile size as a choice, never a text box", () => {
    // ⚠ A free-text box would let an operator author a size the bento cannot lay out — refused at
    // publish, but only after they had written it and everything around it.
    render(<BlockForm block={block("offers", { tiles: [{}] })} onChange={vi.fn()} />);
    const control = screen.getByLabelText(/Tile size/i);
    expect(control.tagName).not.toBe("INPUT");
  });
});

describe("destinations", () => {
  it("never offers a promotion destination", async () => {
    // ⚠ 042 retires the promotion-detail page. Offering that kind would let an operator aim a tile at
    // a route that no longer exists — the exact defect 029 spent a slice fixing.
    // ⚠ Radix marks the page inert while a Select is open, which user-event reads as "this element
    // does not accept pointer events" and refuses to click. The check is right about the DOM and
    // wrong about the intent — a real person clicking the option is exactly what this simulates.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<BlockForm block={block("offers", { tiles: [{}] })} onChange={vi.fn()} />);

    await user.click(screen.getByLabelText(/Button destination/i));
    expect(screen.queryByRole("option", { name: /promotion/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /whole store/i })).toBeInTheDocument();
  });

  it("discards the previous kind's parameter when the kind changes", async () => {
    /**
     * ⚠ A `categoryKey` left behind on a `product` destination is invisible in the form and
     * meaningless to the renderer — and it would reappear if the operator switched back, pointing at
     * whatever it used to point at.
     */
    const onChange = vi.fn();
    // ⚠ Radix marks the page inert while a Select is open, which user-event reads as "this element
    // does not accept pointer events" and refuses to click. The check is right about the DOM and
    // wrong about the intent — a real person clicking the option is exactly what this simulates.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <BlockForm
        block={block("offers", { tiles: [{ ctaDestination: { kind: "category", categoryKey: "bakery" } }] })}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText(/Button destination/i));
    await user.click(screen.getByRole("option", { name: /whole store/i }));

    const next = onChange.mock.calls.at(-1)![0] as { tiles: Array<{ ctaDestination: unknown }> };
    expect(next.tiles[0]!.ctaDestination).toEqual({ kind: "search" });
  });
});

describe("repeating groups", () => {
  it("adds an item and reports the new list", async () => {
    const onChange = vi.fn();
    // ⚠ Radix marks the page inert while a Select is open, which user-event reads as "this element
    // does not accept pointer events" and refuses to click. The check is right about the DOM and
    // wrong about the intent — a real person clicking the option is exactly what this simulates.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<BlockForm block={block("offers", { tiles: [{}] })} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Add tile/i }));
    expect((onChange.mock.calls.at(-1)![0] as { tiles: unknown[] }).tiles).toHaveLength(2);
  });

  it("stops at the maximum and says why rather than failing silently", async () => {
    const tiles = Array.from({ length: 6 }, () => ({}));
    render(<BlockForm block={block("offers", { tiles })} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Add tile/i })).toBeDisabled();
    expect(screen.getByText(/At most 6/i)).toBeInTheDocument();
  });

  it("will not remove the last item below the minimum", () => {
    // `tiles` has min 1 — a zero-tile offers block cannot be published, so letting the operator reach
    // that state would mean a form that produces a layout the server refuses.
    render(<BlockForm block={block("offers", { tiles: [{}] })} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Remove Tiles 1/i })).toBeDisabled();
  });

  it("renders each item's own sub-fields", () => {
    render(<BlockForm block={block("offers", { tiles: [{}, {}] })} onChange={vi.fn()} />);
    // Two tiles, so two of each sub-field — not one shared set.
    expect(screen.getAllByLabelText(/^Headline$/i)).toHaveLength(2);
  });
});

describe("a block this build does not know", () => {
  it("says so instead of crashing the composer", () => {
    // ⚠ FR-042. A layout published by a newer deploy must not break the console for everyone on the
    // older one — the operator can still move or remove the block.
    render(<BlockForm block={block("from_a_newer_deploy")} onChange={vi.fn()} />);
    expect(screen.getByText(/newer version of the platform/i)).toBeInTheDocument();
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Keeps TS from widening the catalogue lookups above.
export type _BlockType = BlockType;
