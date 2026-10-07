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

export const POSTCODE_IN_ZONE = "That postcode already belongs to another zone.";

// ── 069 ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * The console's OWN wording for each field the service can refuse (FR-037). Keyed on the field the
 * service named — never its `message`, which is server prose (FR-008).
 */
const SLOT_FIELD_COPY: Record<string, string> = {
  startTime: "Enter the start as a time of day, like 17:00.",
  endTime: "The slot must end after it starts.",
  cutoffTime: "The cutoff can't be after the slot starts.",
  capacity: "A limit must be a whole number of at least 1, or left empty for no limit.",
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
