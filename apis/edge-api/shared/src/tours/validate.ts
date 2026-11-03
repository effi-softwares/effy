import {
  TOUR_KEY_RE,
  TOUR_OUTCOMES,
  TOUR_VERSION_MAX,
  type ConsoleTourPatch,
  type TourOutcome,
} from "@effy/shared-types";

export type TourPatchResult = { value: ConsoleTourPatch } | { error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * One change per write (106 contracts/tours-api.md): a tour's outcome, the offer switch, or a reset. A refusal names
 * the field, so a client bug is easy to find.
 */
export function parseTourPatch(body: unknown): TourPatchResult {
  if (!isObject(body)) return { error: "the body must be a JSON object" };

  const kinds = [
    "tour" in body || "version" in body || "outcome" in body,
    "offerTours" in body,
    "reset" in body,
  ].filter(Boolean).length;
  if (kinds !== 1) return { error: "send exactly one change: a tour's outcome, offerTours, or reset" };

  if ("offerTours" in body) {
    if (typeof body.offerTours !== "boolean") return { error: "offerTours must be true or false" };
    return { value: { offerTours: body.offerTours } };
  }

  if ("reset" in body) {
    if (body.reset !== true) return { error: "reset must be true" };
    return { value: { reset: true } };
  }

  const { tour, version, outcome } = body;
  if (typeof tour !== "string" || !TOUR_KEY_RE.test(tour)) {
    return { error: "tour must be lower-case letters, digits and hyphens, at most 40 characters" };
  }
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > TOUR_VERSION_MAX) {
    return { error: `version must be a whole number from 1 to ${TOUR_VERSION_MAX}` };
  }
  if (typeof outcome !== "string" || !(TOUR_OUTCOMES as readonly string[]).includes(outcome)) {
    return { error: `outcome must be one of ${TOUR_OUTCOMES.join(", ")}` };
  }
  return { value: { tour, version, outcome: outcome as TourOutcome } };
}
