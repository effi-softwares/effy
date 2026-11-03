import { TOUR_KEY_RE } from "@effy/shared-types";

/**
 * A console's tours are plain data (106 FR-016): one list per console (`features/tours/tours.ts`) a reviewer can
 * read top to bottom. The words are the spec's Tour Inventory, copied - never paraphrased.
 */

export type TourSide = "top" | "right" | "bottom" | "left";

export interface TourStepDef {
  /** `data-tour` key(s) of what the step outlines; the first present wins. `null` = a centred card. */
  target: string | readonly string[] | null;
  /** ≤ 40 characters. */
  title: string;
  /** ≤ 220 characters; one or two sentences. */
  text: string;
  side?: TourSide;
  /** Shown only to managers (FR-012). */
  managersOnly?: boolean;
  /**
   * The spec's "Shown when" column, when it has one. Documentation, plus: a step with a condition may be absent on
   * its page without the development warning firing.
   */
  shownWhen?: string;
}

export interface TourDef {
  /** Unique; lower-case words joined by hyphens. */
  key: string;
  /** Raise it when the tour is rewritten: people who saw an older version see it start by itself again (FR-021). */
  version: number;
  /** As listed in All tours. */
  title: string;
  /** Where the tour runs, for All tours. Absent for the whole-console tour. */
  path?: string;
  search?: Record<string, string>;
  /** The page needs a record (an order, a product); All tours opens the newest one first (FR-007). */
  needsRecord?: "order" | "product";
  /** Runs on any page (the Welcome tour). */
  anyPage?: boolean;
  steps: readonly TourStepDef[];
}

export const TOUR_LIMITS = { titleMax: 40, textMax: 220, stepsMax: 12 } as const;

/** Everything wrong with a list of tours, in words; empty when it is sound (FR-017). */
export function validateTours(tours: readonly TourDef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const tour of tours) {
    if (!TOUR_KEY_RE.test(tour.key)) problems.push(`${tour.key}: the key is not lower-case words joined by hyphens`);
    if (seen.has(tour.key)) problems.push(`${tour.key}: the key is used twice`);
    seen.add(tour.key);
    if (!Number.isInteger(tour.version) || tour.version < 1) problems.push(`${tour.key}: the version must be 1 or more`);
    if (tour.steps.length < 1 || tour.steps.length > TOUR_LIMITS.stepsMax) {
      problems.push(`${tour.key}: ${tour.steps.length} steps (1 to ${TOUR_LIMITS.stepsMax})`);
    }
    tour.steps.forEach((step, i) => {
      if (step.title.length > TOUR_LIMITS.titleMax) problems.push(`${tour.key} step ${i + 1}: the title is over ${TOUR_LIMITS.titleMax}`);
      if (step.text.length > TOUR_LIMITS.textMax) problems.push(`${tour.key} step ${i + 1}: the text is over ${TOUR_LIMITS.textMax}`);
    });
  }
  return problems;
}

/** Identity, with the list checked once; a problem is reported, never thrown (the tests fail on it instead). */
export function defineTours(tours: readonly TourDef[]): readonly TourDef[] {
  const problems = validateTours(tours);
  if (problems.length > 0) console.error(`[tours] ${problems.join("; ")}`);
  return tours;
}
