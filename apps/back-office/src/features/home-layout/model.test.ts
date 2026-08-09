import type { LayoutBody } from "@effy/shared-types";
import { MAX_BLOCKS_PER_LAYOUT } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

import {
  addFromPreset,
  isAtBlockCeiling,
  isDirty,
  moveDown,
  moveUp,
  newBlockId,
  positionOf,
  removeBlock,
  setHidden,
  updateProps,
} from "./model";

/**
 * ⚠ REORDERING IS THE FEATURE'S HEADLINE CAPABILITY AND EVERY WAY OF GETTING IT WRONG IS SILENT.
 * Drop a block, duplicate one, move the wrong one, no-op at the ends — each produces a page that
 * still renders perfectly well and is simply not the page the operator asked for. There is nothing
 * to crash and nothing to log. These functions are pure so that the boundaries can be checked
 * directly, which is the only place this behaviour can be pinned down cheaply.
 */

const body = (...ids: string[]): LayoutBody =>
  ids.map((id) => ({ id, type: "app_promo", props: {} }));
const ids = (b: LayoutBody) => b.map((x) => x.id);

describe("moving a block", () => {
  it("swaps it with its neighbour above", () => {
    expect(ids(moveUp(body("a", "b", "c"), 1))).toEqual(["b", "a", "c"]);
  });

  it("swaps it with its neighbour below", () => {
    expect(ids(moveDown(body("a", "b", "c"), 1))).toEqual(["a", "c", "b"]);
  });

  /**
   * ⚠ NO WRAPPING AT THE ENDS. With the control now keyboard-only (FR-004 as amended), repeat
   * activation is the ordinary way to move a block several places — so a wrap would mean an operator
   * holding "move up" watches the top block leap to the bottom of the page. A no-op is what a
   * disabled control should do if it is ever activated anyway.
   */
  it("does nothing at the top, and does not wrap to the bottom", () => {
    const before = body("a", "b", "c");
    expect(ids(moveUp(before, 0))).toEqual(["a", "b", "c"]);
  });

  it("does nothing at the bottom, and does not wrap to the top", () => {
    const before = body("a", "b", "c");
    expect(ids(moveDown(before, 2))).toEqual(["a", "b", "c"]);
  });

  it("ignores an index that is not in the layout rather than corrupting it", () => {
    expect(ids(moveUp(body("a", "b"), 9))).toEqual(["a", "b"]);
    expect(ids(moveDown(body("a", "b"), -1))).toEqual(["a", "b"]);
  });

  it("never changes how many blocks there are", () => {
    // The failure this rules out is the one that looks like a successful reorder until someone
    // counts the sections on the page.
    for (const i of [0, 1, 2]) {
      expect(moveUp(body("a", "b", "c"), i)).toHaveLength(3);
      expect(moveDown(body("a", "b", "c"), i)).toHaveLength(3);
    }
  });

  it("returns a new array and leaves the original untouched", () => {
    // TanStack Query holds this data. Mutating it in place is how a screen ends up disagreeing with
    // the server about what it is showing.
    const before = body("a", "b");
    const after = moveUp(before, 1);
    expect(ids(before)).toEqual(["a", "b"]);
    expect(after).not.toBe(before);
  });

  it("returns to where it started after a move down and back up", () => {
    const before = body("a", "b", "c");
    expect(ids(moveUp(moveDown(before, 0), 1))).toEqual(["a", "b", "c"]);
  });
});

describe("position reporting", () => {
  it("disables up at the top and down at the bottom", () => {
    const b = body("a", "b", "c");
    expect(positionOf(b, 0)).toMatchObject({ canMoveUp: false, canMoveDown: true });
    expect(positionOf(b, 1)).toMatchObject({ canMoveUp: true, canMoveDown: true });
    expect(positionOf(b, 2)).toMatchObject({ canMoveUp: true, canMoveDown: false });
  });

  it("disables both directions when there is only one block", () => {
    expect(positionOf(body("only"), 0)).toMatchObject({ canMoveUp: false, canMoveDown: false });
  });
});

describe("hiding versus removing", () => {
  /**
   * ⚠ THE DIFFERENCE IS THE BLOCK'S CONTENT (FR-005). A seasonal section taken down in February has
   * to come back in November with its words and artwork intact. Delete it and the operator retypes
   * everything — which is the reason hiding exists at all.
   */
  it("keeps the block and its content when hidden", () => {
    const before: LayoutBody = [{ id: "a", type: "app_promo", props: { headline: "Christmas" } }];
    const after = setHidden(before, "a", true);
    expect(after).toHaveLength(1);
    expect(after[0]?.hidden).toBe(true);
    expect(after[0]?.props).toEqual({ headline: "Christmas" });
  });

  /**
   * ⚠ Showing DROPS the key rather than setting it false, so a shown block is byte-identical to one
   * that was never hidden. Otherwise the same layout has two encodings, and a diff of the stored
   * JSON reports changes nobody made.
   */
  it("drops the flag entirely when shown again, rather than storing false", () => {
    const hidden = setHidden(body("a"), "a", true);
    const shown = setHidden(hidden, "a", false);
    expect("hidden" in (shown[0] as object)).toBe(false);
    expect(shown[0]).toEqual({ id: "a", type: "app_promo", props: {} });
  });

  it("removes only the named block", () => {
    expect(ids(removeBlock(body("a", "b", "c"), "b"))).toEqual(["a", "c"]);
  });

  it("leaves the layout alone when the id is not in it", () => {
    expect(ids(removeBlock(body("a", "b"), "nope"))).toEqual(["a", "b"]);
  });
});

describe("adding from a preset", () => {
  /**
   * ⚠ FROM A PRESET, NEVER AN EMPTY SHELL (FR-003) — the single highest-leverage decision in the
   * composer for an operator working alone. An empty block asks someone to invent both the content
   * and the shape of it before they see anything; a pre-filled one can be published as-is.
   */
  it("arrives pre-filled with the preset's content", () => {
    const after = addFromPreset([], "app_promo", "App is on its way", () => "b_1");
    expect(after).toHaveLength(1);
    expect(after[0]?.props).toEqual({ headline: "The Effy app is on its way" });
  });

  it("appends rather than inserting, so the operator positions it deliberately", () => {
    const after = addFromPreset(body("a"), "newsletter", "Keep up with Effy", () => "b_2");
    expect(ids(after)).toEqual(["a", "b_2"]);
  });

  /**
   * ⚠ Two blocks from one preset must not share a props object. They would edit as one, and nothing
   * on screen would explain why typing in one changed the other.
   */
  it("gives each added block its own props object", () => {
    let n = 0;
    const twice = addFromPreset(
      addFromPreset([], "app_promo", "App is on its way", () => `b_${++n}`),
      "app_promo",
      "App is on its way",
      () => `b_${++n}`,
    );
    expect(twice[0]?.props).not.toBe(twice[1]?.props);
    twice[0]!.props.headline = "changed";
    expect(twice[1]?.props.headline).toBe("The Effy app is on its way");
  });

  it("refuses a preset name the catalogue does not define, rather than adding a blank", () => {
    expect(addFromPreset([], "app_promo", "not a preset", () => "b_1")).toHaveLength(0);
  });

  it("stops at the block ceiling so a layout cannot grow without limit (FR-009)", () => {
    let full: LayoutBody = [];
    for (let i = 0; i < MAX_BLOCKS_PER_LAYOUT; i += 1) {
      full = [...full, { id: `b_${i}`, type: "app_promo", props: {} }];
    }
    expect(isAtBlockCeiling(full)).toBe(true);
    expect(addFromPreset(full, "app_promo", "App is on its way", () => "over")).toHaveLength(
      MAX_BLOCKS_PER_LAYOUT,
    );
  });
});

describe("block ids", () => {
  /**
   * ⚠ GENERATED, NEVER DERIVED FROM POSITION. A positional id would make a reorder indistinguishable
   * from a delete-plus-create: React would remount every block below the moved one — losing focus in
   * the middle of a keyboard move, which is the one interaction FR-004 now depends on entirely — and
   * an audit entry would point at whatever occupies that slot afterwards.
   */
  it("are unique across calls", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newBlockId()));
    expect(seen.size).toBe(200);
  });
});

describe("dirty tracking", () => {
  it("is clean when the draft matches what is published", () => {
    expect(isDirty(body("a", "b"), body("a", "b"))).toBe(false);
  });

  it("notices a reorder, which changes no block at all", () => {
    // The one edit that changes no block's content — and therefore the one a naive comparison misses.
    expect(isDirty(body("b", "a"), body("a", "b"))).toBe(true);
  });

  it("notices a props edit", () => {
    const published: LayoutBody = [{ id: "a", type: "app_promo", props: { headline: "one" } }];
    expect(isDirty(updateProps(published, "a", { headline: "two" }), published)).toBe(true);
  });

  it("notices a hide, which removes nothing", () => {
    expect(isDirty(setHidden(body("a"), "a", true), body("a"))).toBe(true);
  });
});
