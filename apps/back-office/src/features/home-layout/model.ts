import {
  BLOCK_CATALOGUE,
  type BlockType,
  type LayoutBlock,
  type LayoutBody,
  MAX_BLOCKS_PER_LAYOUT,
} from "@effy/shared-types";

/**
 * Block-list operations as PURE FUNCTIONS over an ordered array (042 US1).
 *
 * ⚠ THEY ARE PURE SO THAT THE ONE THING THIS SCREEN MUST GET RIGHT IS TESTABLE. Reordering is the
 * feature's headline capability, and every way of getting it wrong — dropping a block, duplicating
 * one, moving the wrong one, silently no-op'ing at the ends — produces a page that still renders.
 * There is no crash to notice. A React component that owned this logic could only be checked by
 * rendering it; a function can be checked directly, at every boundary, in a few lines.
 *
 * ⚠ EVERY OPERATION RETURNS A NEW ARRAY and never mutates its input. TanStack Query holds the layout,
 * and mutating cached data in place is how a screen ends up disagreeing with the server about what it
 * is showing.
 */

/** Where a block sits, and whether it can move — what the UI needs to render its controls. */
export interface BlockPosition {
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function positionOf(body: LayoutBody, index: number): BlockPosition {
  return {
    index,
    canMoveUp: index > 0,
    canMoveDown: index < body.length - 1,
  };
}

/**
 * Move a block one place towards the top.
 *
 * ⚠ MOVING THE FIRST BLOCK UP IS A NO-OP THAT RETURNS THE SAME ARRAY, not a wrapped move to the end.
 * Wrapping would mean a member of staff holding the "move up" control watches the top block leap to
 * the bottom of the page — and with the control now keyboard-only (FR-004 as amended), repeat
 * activation is the ordinary way to move a block several places.
 */
export function moveUp(body: LayoutBody, index: number): LayoutBody {
  if (index <= 0 || index >= body.length) return body;
  return swap(body, index, index - 1);
}

export function moveDown(body: LayoutBody, index: number): LayoutBody {
  if (index < 0 || index >= body.length - 1) return body;
  return swap(body, index, index + 1);
}

function swap(body: LayoutBody, a: number, b: number): LayoutBody {
  const next = [...body];
  const tmp = next[a]!;
  next[a] = next[b]!;
  next[b] = tmp;
  return next;
}

/**
 * Hide or show a block.
 *
 * ⚠ HIDING IS NOT REMOVING, and the difference is the block's CONTENT (FR-005). A seasonal section
 * taken down in February has to come back in November with its words and its artwork intact; delete
 * it and the operator retypes everything. `hidden` is dropped rather than set to `false` so a shown
 * block is byte-identical to one that was never hidden — otherwise the same layout has two encodings
 * and a diff of the stored JSON reports changes nobody made.
 */
export function setHidden(body: LayoutBody, id: string, hidden: boolean): LayoutBody {
  return body.map((b) => {
    if (b.id !== id) return b;
    if (hidden) return { ...b, hidden: true };
    const { hidden: _dropped, ...rest } = b;
    return rest;
  });
}

export function removeBlock(body: LayoutBody, id: string): LayoutBody {
  return body.filter((b) => b.id !== id);
}

/**
 * Add a block from a preset.
 *
 * ⚠ FROM A PRESET, NEVER AS AN EMPTY SHELL (FR-003). This is the single highest-leverage decision in
 * the composer for an operator working alone: an empty block asks someone to invent both the content
 * and the shape of it before they can see anything, whereas a pre-filled one can be published as-is
 * and edited afterwards. It is the difference between a tool that helps and a form that interrogates.
 *
 * Returns the body unchanged when the ceiling is reached — the caller surfaces the limit (FR-009).
 */
export function addFromPreset(
  body: LayoutBody,
  type: BlockType,
  presetName: string,
  newId: () => string,
): LayoutBody {
  if (body.length >= MAX_BLOCKS_PER_LAYOUT) return body;
  const preset = BLOCK_CATALOGUE[type]?.presets.find((p) => p.name === presetName);
  if (!preset) return body;

  const block: LayoutBlock = {
    id: newId(),
    type,
    // ⚠ Structurally cloned, so two blocks added from one preset do not share a props object. They
    // would edit as one, and the operator would have no way to tell why.
    props: structuredClone(preset.props) as Record<string, unknown>,
  };
  return [...body, block];
}

/** Replace one block's props, leaving its position and identity alone. */
export function updateProps(
  body: LayoutBody,
  id: string,
  props: Record<string, unknown>,
): LayoutBody {
  return body.map((b) => (b.id === id ? { ...b, props } : b));
}

/**
 * ⚠ IDs ARE GENERATED, NEVER DERIVED FROM POSITION OR CONTENT. A positional id would make a reorder
 * indistinguishable from a delete-plus-create — React would remount every block below the moved one,
 * losing focus mid-keyboard-move, and an audit entry would point at whatever now occupies that slot.
 */
export function newBlockId(): string {
  return `b_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/** True when the layout is at its ceiling and the add controls should say so rather than fail. */
export function isAtBlockCeiling(body: LayoutBody): boolean {
  return body.length >= MAX_BLOCKS_PER_LAYOUT;
}

/**
 * Has the draft moved away from what is published?
 *
 * ⚠ Compared by VALUE rather than by a dirty flag. A flag has to be set everywhere a change can
 * happen and cleared everywhere a save can, and the failure — an operator told they have unsaved work
 * when they do not, or worse, not told when they do — is silent either way.
 */
export function isDirty(draft: LayoutBody, published: LayoutBody): boolean {
  return JSON.stringify(draft) !== JSON.stringify(published);
}
