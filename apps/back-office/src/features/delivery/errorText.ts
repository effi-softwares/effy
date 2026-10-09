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
  effyLookaheadDays: "Customers can be offered between 1 and 14 delivery days after today.",
  noDeliveryWeekdays: "At least one day of the week must have delivery.",
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
  courier_plan_missing: "Make a courier fee table active on the Pricing tab before switching courier delivery on.",
  // 079 — what a customer is told about when a courier order arrives.
  courier_estimate_missing: "Say how long a courier usually takes before switching courier delivery on.",
  courier_estimate_in_use: "Switch courier delivery off before removing its estimate.",
  invalid_estimate: "The estimate is 3 to 60 characters on one line, like \"2–4 business days\".",
  // 080 — courier services carry the timeframe now.
  courier_service_missing: "Add a courier service and make it the default before switching courier delivery on.",
  name_taken: "There is already a courier service with that courier and service name.",
  default_service_required: "Make another service the default first — checkout tells courier customers the default's timeframe.",
  invalid_service: "Check the highlighted fields.",
};

/** 080 — what staff read for each refused courier-service field, in the console's own words. */
const COURIER_SERVICE_FIELD_COPY: Record<string, string> = {
  courierName: "The courier's name is 2 to 60 characters.",
  serviceName: "The service's name is 2 to 60 characters.",
  estimateText: "3 to 60 characters on one line, like \"2–4 business days\".",
  maxBusinessDays: "A whole number of business days, 1 to 30.",
  pickupWeekdays: "Choose at least one pickup day.",
  pickupCutoff: "A time, like 14:00.",
  status: "The default service can't be retired — make another the default first.",
};

export const courierServiceError = (err: unknown): string => coverageError(err);

/** Field → words for a refused courier-service save; empty when the refusal named no field. */
export function courierServiceFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isDomainError(err)) {
    for (const f of err.fields ?? []) {
      const copy = COURIER_SERVICE_FIELD_COPY[f.field];
      if (copy && !out[f.field]) out[f.field] = copy;
    }
  }
  return out;
}

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
  // 079 — on, and no customer is offered it yet.
  courier_not_ready: "Not on Effy's list. Courier delivery is switched on but has no fee table or no default courier service, so nobody delivers there.",
  unknown_postcode: "Not a known postcode.",
};

export const NO_DRIVER_GROUP = "No driver is cleared to deliver to that group. Orders placed there could not be given to anyone until a driver is cleared for it.";
export const NO_DRIVER_UNGROUPED =
  "These postcodes would be in no group, and no driver is cleared to deliver everywhere. Orders placed there could not be given to anyone.";

// ── 083: going live ────────────────────────────────────────────────────────────────────────────────

/** The console's own words for each way the switch is refused; keyed on the contract's `code`. */
const GO_LIVE_COPY: Record<string, string> = {
  not_ready: "The platform is not ready: something the new delivery model needs is missing. The items marked Not ready below say what.",
  changed: "Someone else changed the switch a moment ago. This page now shows what they set — check it and try again.",
  removed: "The old delivery arrangement has been removed, so the new model is on for good.",
};

export function goLiveError(err: unknown): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "Only an administrator can switch the delivery model.";
    if (err.code && GO_LIVE_COPY[err.code]) return GO_LIVE_COPY[err.code]!;
    if (err.status === 400) return "Enter a date and time — and, to turn the model back off, say why.";
  }
  return deliveryMutationError(err);
}
