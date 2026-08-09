import { useEffect, useRef } from "react";

import { ChevronDown, ChevronUp, Eye, EyeOff, Trash2 } from "lucide-react";

import { BLOCK_CATALOGUE, type BlockType, type LayoutBody } from "@effy/shared-types";
import { Button } from "@effy/design-system/ui";

import { positionOf } from "../model";

/**
 * The layout as an ordered list of blocks, with move / hide / remove per row (042 US1).
 *
 * ⚠ NOT A CARD GRID — Principle V, and for the reason the doctrine gives rather than out of
 * obedience. The operator's question here is positional: what comes after what. A vertical list of
 * detail rows answers that by its own shape; a grid of cards makes the reader reconstruct the order
 * from a reading direction.
 *
 * ⚠ MOVE CONTROLS ARE BUTTONS, NOT DRAG (FR-004 as amended 2026-08-09). Drag was withdrawn: it added
 * a dependency and a second reordering mechanism to keep in step with the first, in exchange for
 * convenience on a list the 20-block ceiling already keeps short. Which means the keyboard path is no
 * longer the accessible fallback behind a pointer affordance — it is the ONLY path, for everyone. It
 * cannot be the thing that goes untested.
 */

export interface BlockListProps {
  body: LayoutBody;
  /** False for read-only viewers (csa). The server decides; this only hides the controls. */
  canEdit: boolean;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  onRemove: (id: string) => void;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}

export function BlockList({
  body,
  canEdit,
  onMoveUp,
  onMoveDown,
  onToggleHidden,
  onRemove,
  onSelect,
  selectedId,
}: BlockListProps) {
  /**
   * ⚠ FOCUS FOLLOWS THE BLOCK, NOT THE BUTTON (US1 acceptance scenario 2) — and TWO SEPARATE THINGS
   * deliver that, which is worth stating because the smaller-looking one does most of the work.
   *
   * 1. `key={block.id}` on the row below. React MOVES the existing DOM nodes rather than re-creating
   *    them, so the focused button travels with its block for free. ⚠ Keying by INDEX instead — the
   *    obvious thing to write — silently breaks this: the browser keeps focus at that screen
   *    position, and the operator's next activation moves whichever block has slid into the slot they
   *    were on. Press "move up" three times and three different blocks move. On screen it reads as
   *    the list fighting them, not as a bug. Proven by `HomeComposerScreen.test.tsx`, which fails on
   *    an index key.
   *
   * 2. The effect below, which covers the case keying alone cannot: a block reaching an end, where
   *    the control it was travelling on becomes DISABLED. Focus on a disabled button is focus lost to
   *    the document, which drops the operator back to the top of the page mid-task — so the effect
   *    re-aims at the opposite direction.
   *
   * The refs are keyed by block id for the same reason the rows are.
   */
  const pendingFocus = useRef<{ id: string; dir: "up" | "down" } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    pendingFocus.current = null;

    // ⚠ Fall back to the OPPOSITE control when the block has reached an end, because the one it was
    // travelling on is now disabled — and focus on a disabled button is focus lost to the document,
    // which drops the operator back to the top of the page mid-task.
    const primary = buttons.current.get(`${want.id}:${want.dir}`);
    const fallback = buttons.current.get(`${want.id}:${want.dir === "up" ? "down" : "up"}`);
    const target = primary && !primary.disabled ? primary : fallback;
    target?.focus();
  }, [body]);

  const move = (id: string, index: number, dir: "up" | "down") => {
    pendingFocus.current = { id, dir };
    if (dir === "up") onMoveUp(index);
    else onMoveDown(index);
  };

  if (body.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        This layout has no blocks yet. Add one to get started — every block arrives pre-filled.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-border border-y border-border">
      {body.map((block, index) => {
        const pos = positionOf(body, index);
        const label = BLOCK_CATALOGUE[block.type as BlockType]?.label ?? block.type;
        const hidden = block.hidden === true;

        return (
          <li
            key={block.id}
            className={`flex items-center gap-3 py-3 ${selectedId === block.id ? "bg-muted/50" : ""}`}
          >
            {/* ⚠ The position is stated as text, not implied by the row's place on screen. A screen
                reader moving through this list otherwise has no way to know a block moved at all —
                the announcement of the reorder IS this number changing under the same element. */}
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </span>

            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => onSelect?.(block.id)}
              aria-current={selectedId === block.id ? "true" : undefined}
            >
              <span className={`block truncate text-sm font-medium ${hidden ? "text-muted-foreground" : ""}`}>
                {label}
              </span>
              {hidden && (
                // ⚠ Said in words, not signalled by dimming alone. A hidden block looks identical to
                // a low-contrast one, and the difference is whether shoppers can see the section.
                <span className="block text-xs text-muted-foreground">Hidden — not shown to shoppers</span>
              )}
            </button>

            {canEdit && (
              <div className="flex shrink-0 items-center gap-1">
                {/* ⚠ DISABLED AT THE ENDS RATHER THAN ABSENT. A control that disappears makes every
                    other control shift sideways as a block travels, so the operator's pointer and
                    their focus both land on something they did not aim at. */}
                <Button
                  ref={(el) => {
                    if (el) buttons.current.set(`${block.id}:up`, el);
                    else buttons.current.delete(`${block.id}:up`);
                  }}
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!pos.canMoveUp}
                  onClick={() => move(block.id, index, "up")}
                  aria-label={`Move ${label} up, currently ${index + 1} of ${body.length}`}
                >
                  <ChevronUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  ref={(el) => {
                    if (el) buttons.current.set(`${block.id}:down`, el);
                    else buttons.current.delete(`${block.id}:down`);
                  }}
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!pos.canMoveDown}
                  onClick={() => move(block.id, index, "down")}
                  aria-label={`Move ${label} down, currently ${index + 1} of ${body.length}`}
                >
                  <ChevronDown className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onToggleHidden(block.id, !hidden)}
                  aria-label={hidden ? `Show ${label} to shoppers` : `Hide ${label} from shoppers`}
                >
                  {hidden ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(block.id)}
                  aria-label={`Remove ${label}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
