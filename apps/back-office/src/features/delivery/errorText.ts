import { isDomainError } from "@effy/api-client";

// Uniform, non-leaking mutation-failure copy for the delivery screens. Keyed off DomainError.kind and
// status (never a raw detail), matching the promotions/ErrorState convention.
export function deliveryMutationError(err: unknown, conflictMessage?: string): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "You don't have permission to change delivery configuration.";
    if (err.kind === "not-found") return "That item no longer exists.";
    if (err.kind === "unavailable")
      return "The service is waking up or unreachable. Try again in a moment.";
    if (err.status === 409) return conflictMessage ?? "That change conflicts with existing data.";
    if (err.status === 422) return conflictMessage ?? "That can't be applied yet — check the details.";
    if (err.status === 400) return "Please check the fields and try again.";
  }
  return "Something went wrong. Please try again.";
}

// Activation-specific copy: a plan must price every ring and carry a weight band before it can go live.
export const PLAN_INCOMPLETE =
  "This plan can't price every served zone yet. Price every ring and add at least one weight band, then activate.";


// ── 069 ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * The console's OWN wording for each field the service can refuse (FR-037). Keyed on the field the
 * service named — never its `message`, which is server prose (FR-008).
 */
const SLOT_FIELD_COPY: Record<string, string> = {
  startTime: "Enter the start as a time of day, like 17:00.",
  endTime: "The slot must end after it starts.",
  cutoffTime: "The cutoff can't be after the slot starts.",
  capacity: "Enter a limit as a whole number of at least 1, or untick the limit.",
  status: "Choose active or off.",
  lookaheadDays: "Customers can be offered between 1 and 30 days.",
  noDeliveryWeekdays: "At least one day of the week must have delivery.",
  carrierLeadDays: "The carrier lead time must be between 0 and 14 days.",
  slotHoldMin: "A place can be held for between 1 and 60 minutes.",
  hubTurnaroundMin: "The hub turnaround must be between 0 and 480 minutes.",
  day: "Enter a real date.",
};

export const SLOT_DUPLICATE = "There is already a slot with these start and end times.";
export const HUB_NOT_SET = "Set the delivery hub on the Settings tab first — these settings are saved with it.";

/** Field → message for a refused slot or delivery-day save; empty when the refusal named no field. */
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isDomainError(err) && err.status === 400) {
    for (const f of err.fields ?? []) {
      const copy = SLOT_FIELD_COPY[f.field];
      if (copy && !out[f.field]) out[f.field] = copy;
    }
  }
  return out;
}

// ── 076: coverage ────────────────────────────────────────────────────────────────────────────────

/**
 * The console's OWN sentence for each coverage refusal, keyed on the code the service sent — never
 * its `detail`, which is server prose (FR-008).
 */
const COVERAGE_COPY: Record<string, string> = {
  invalid_postcode: "A postcode is four digits.",
  invalid_query: "Enter a four-digit postcode or a place name.",
  invalid_name: "A group name is 2 to 60 characters.",
  unknown_postcode: "That isn't a known postcode.",
  distance_required: "No place in this postcode has a known location. Enter its distance from the hub.",
  distance_out_of_range: "Enter a distance between 0 and 5,000 km.",
  distance_not_computable: "No place in this postcode has a known location, so its distance can't be worked out. Keep the one entered by hand.",
  group_not_found: "That group no longer exists.",
  group_name_taken: "There is already a group with that name.",
  not_listed: "That postcode is no longer on the list.",
  already_excluded: "That postcode is already excluded.",
  not_excluded: "That postcode is no longer excluded.",
  reason_required: "Say why, in a few words.",
  courier_ordering_unavailable: "Courier delivery can be switched on once customers can place courier orders.",
};

/** The refusal's code, when the service named one. */
export function coverageCode(err: unknown): string | undefined {
  return isDomainError(err) ? err.code : undefined;
}

/** `no_driver_covers` is not an error to show — it is a question to ask. */
export const isNoDriverCovers = (err: unknown): boolean => coverageCode(err) === "no_driver_covers";

export function coverageError(err: unknown): string {
  const code = coverageCode(err);
  return (code && COVERAGE_COPY[code]) || deliveryMutationError(err);
}

/** What staff read in the checker, for each reason the service can give (FR-025). */
export const COVERAGE_REASON_COPY: Record<string, string> = {
  listed: "On Effy's list.",
  courier_offered: "Not on Effy's list. Courier delivery is offered there.",
  courier_off: "Not on Effy's list. Courier delivery is switched off, so nobody delivers there.",
  courier_excluded: "Not on Effy's list, and excluded from courier delivery.",
  unknown_postcode: "Not a known postcode.",
};

export const NO_DRIVER_GROUP = "No driver is cleared to deliver to that group. Orders placed there could not be given to anyone until a driver is cleared for it.";
export const NO_DRIVER_UNGROUPED =
  "These postcodes would be in no group, and no driver is cleared to deliver everywhere. Orders placed there could not be given to anyone.";
