import { isDomainError } from "@effy/api-client";
import type { PlanGapCode, PlanGapDTO } from "@effy/shared-types";

import { deliveryMutationError } from "../errorText";

// The console's OWN words for each thing a plan can be missing (077 FR-018), keyed on the code the
// service sends — never its prose. A `Record` over the closed union, so a new code does not compile
// until it has a sentence: 047 shipped "cannot activate" with nobody able to say which term refused.

const kg = (grams: unknown) => `${Number(grams) / 1000} kg`;
const money = (v: unknown) => `$${Number(v).toFixed(2)}`;
const band = (v: unknown) => (v === null || v === undefined ? "the last band" : `the band up to ${Number(v)} km`);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const GAP_TEXT: Record<PlanGapCode, (d: PlanGapDTO["detail"]) => string> = {
  distance_bands_missing: () => "Add at least one distance band.",
  distance_open_band_missing: (d) =>
    `The distance bands stop at ${Number(d.lastUpperKm)} km. Add a last band with no upper limit, so every distance has a price.`,
  weight_bands_missing: () => "Add at least one weight band.",
  distance_not_monotonic: (d) =>
    `${capital(band(d.upperKm))} (${money(d.upperAmount)}) costs less than ${band(d.lowerKm)} (${money(d.lowerAmount)}). A farther delivery cannot cost less.`,
  weight_not_monotonic: (d) =>
    `The band up to ${kg(d.upperGrams)} (${money(d.upperAmount)}) costs less than the band up to ${kg(d.lowerGrams)} (${money(d.lowerAmount)}). A heavier basket cannot cost less.`,
  floor_is_zero: () => "The minimum fee is $0.00. Activating will ask you to confirm that delivery may be free without the free-delivery amount.",
  premium_on_disabled_slot: (d) => `The ${String(d.start)}–${String(d.end)} window is switched off. Its surcharge is kept but will not apply.`,
};

export function gapText(gap: PlanGapDTO): string {
  return GAP_TEXT[gap.code](gap.detail);
}

/**
 * Per-field problems for a refused save, keyed on the field the service named. ⚠ The service's
 * field messages are written for this console (they name the rule, never a value), so they are shown.
 */
export function planFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isDomainError(err) && err.status === 422) {
    for (const f of err.fields ?? []) if (!out[f.field]) out[f.field] = f.message;
  }
  return out;
}

const PLAN_COPY: Record<string, string> = {
  plan_incomplete: "This plan can't price every delivery yet — see what is missing.",
  zero_floor_unconfirmed: "Confirm that delivery may be free without the free-delivery amount.",
  plan_not_draft: "This plan has been active, so it can't be changed. Copy it to a new draft.",
  plan_retired: "A replaced plan isn't brought back. Copy it to a new draft and activate that.",
  plan_already_active: "This plan is already the one in force.",
  duplicate_name: "Another plan already has that name.",
  invalid_plan: "Check the highlighted values.",
  plan_kind_mismatch: "That plan is for the other kind of delivery.",
  unknown_postcode: "That isn't a known postcode.",
  invalid_postcode: "A postcode is four digits.",
  invalid_request: "Check the weight and basket value.",
  plan_not_found: "No plan of that kind is in force.",
};

export function pricingError(err: unknown): string {
  const code = isDomainError(err) ? err.code : undefined;
  return (code && PLAN_COPY[code]) || deliveryMutationError(err);
}
