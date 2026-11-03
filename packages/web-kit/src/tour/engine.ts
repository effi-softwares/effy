import type { ConsoleTourPatch, ConsoleTourStateDTO } from "@effy/shared-types";

import type { TourDef, TourStepDef } from "./define";

/** The tour rules, as pure functions (106). Nothing here touches React. */

export const EMPTY_TOUR_SENTENCE = "There's nothing here to show yet. Try this tour again once the page has something in it.";
export const PAGE_NOT_LOADED_HINT = "The tour is available once this page loads.";

export type PageStatus = "loading" | "ready" | "error";

/** A page's main query, said as the tour's three states (research R6): only `ready` offers or runs a tour. */
export function tourStatus(query: { isSuccess: boolean; isError: boolean }): PageStatus {
  if (query.isSuccess) return "ready";
  if (query.isError) return "error";
  return "loading";
}

/**
 * On screen now: connected, laid out with a size, and not inside `[hidden]` or `[inert]`. `aria-hidden` is deliberately not a
 * test - Radix modal layers set it on the whole page while they are open or closing (research R2, R7).
 */
export function isPresent(el: Element | null | undefined): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  if (el.closest("[hidden], [inert]")) return false;
  // Laid out with a size: an empty wrapper (a section with nothing in it) is not something to point at.
  return Array.from(el.getClientRects()).some((r) => r.width > 0 || r.height > 0);
}

const keysOf = (target: TourStepDef["target"]): readonly string[] =>
  target === null ? [] : typeof target === "string" ? [target] : target;

/**
 * The element a step outlines: for each key in order, the first PRESENT element carrying it - one key can sit on
 * responsive twins, and only one of them is visible. `undefined` = absent; `null` = a centred step.
 */
export function resolveTarget(target: TourStepDef["target"], root: ParentNode = document): HTMLElement | null | undefined {
  if (target === null) return null;
  for (const key of keysOf(target)) {
    for (const el of Array.from(root.querySelectorAll(`[data-tour="${key}"]`))) {
      if (isPresent(el)) return el as HTMLElement;
    }
  }
  return undefined;
}

export interface StepContext {
  /** The person's role keys. */
  roles: ReadonlySet<string>;
  root?: ParentNode;
}

const hasAnyRole = (needed: readonly string[] | undefined, held: ReadonlySet<string>): boolean =>
  !needed || needed.length === 0 || needed.some((r) => held.has(r));

/** May this person have this tour at all? A tour limited to roles is nobody else's (107 FR-005). */
export function tourAllowed(tour: TourDef, roles: ReadonlySet<string>): boolean {
  return hasAnyRole(tour.roles, roles);
}

export function stepVisible(step: TourStepDef, ctx: StepContext): boolean {
  if (!hasAnyRole(step.roles, ctx.roles)) return false;
  return resolveTarget(step.target, ctx.root) !== undefined;
}

/** The indexes of the steps shown right now, in order. */
export function shownSteps(tour: TourDef, ctx: StepContext): number[] {
  const out: number[] = [];
  tour.steps.forEach((step, i) => {
    if (stepVisible(step, ctx)) out.push(i);
  });
  return out;
}

/** The next (or previous) shown step from `from`; `null` when there is none. */
export function nextShown(tour: TourDef, from: number, dir: 1 | -1, ctx: StepContext): number | null {
  for (let i = from + dir; i >= 0 && i < tour.steps.length; i += dir) {
    if (stepVisible(tour.steps[i]!, ctx)) return i;
  }
  return null;
}

/** "Step N of M", counting only the steps shown now. */
export function counter(tour: TourDef, index: number, ctx: StepContext): { step: number; of: number } {
  const shown = shownSteps(tour, ctx);
  const at = shown.indexOf(index);
  return { step: at < 0 ? shown.filter((i) => i < index).length + 1 : at + 1, of: Math.max(shown.length, 1) };
}

/** Starts by itself when tours are on, and it was never shown or shown at an older version (data-model rule). */
export function shouldOffer(tour: TourDef, state: ConsoleTourStateDTO): boolean {
  if (!state.offerTours) return false;
  const seen = state.seen[tour.key];
  return !seen || seen.version < tour.version;
}

/** Seen before, at an older version (All tours says "Updated"). */
export function isRevised(tour: TourDef, state: ConsoleTourStateDTO): boolean {
  const seen = state.seen[tour.key];
  return Boolean(seen && seen.version < tour.version);
}

/** The whole-console tour comes first: while it would start, no page tour does (FR-003). */
export function welcomeFirst(
  tours: readonly TourDef[],
  state: ConsoleTourStateDTO,
  roles: ReadonlySet<string> = new Set(),
): TourDef | null {
  const welcome = tours.find((t) => t.anyPage && tourAllowed(t, roles));
  return welcome && shouldOffer(welcome, state) ? welcome : null;
}

/** What the server will hold after a write - for the optimistic copy (research R11). */
export function applyPatch(state: ConsoleTourStateDTO, patch: ConsoleTourPatch, now = new Date()): ConsoleTourStateDTO {
  if ("offerTours" in patch) return { ...state, offerTours: patch.offerTours };
  if ("reset" in patch) return { ...state, seen: {} };
  return {
    ...state,
    seen: { ...state.seen, [patch.tour]: { version: patch.version, outcome: patch.outcome, at: now.toISOString() } },
  };
}
