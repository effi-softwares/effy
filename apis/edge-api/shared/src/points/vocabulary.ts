/**
 * The points vocabulary: the kinds of change, the reasons each may carry, and the customer's words for
 * each. Closed lists, matching the check on points_entry.reason: a new flow adds its reason to both.
 * The staff note is never shown to the customer.
 */

export const CREDIT_KINDS = ["staff_credit", "auto_credit", "returned"] as const;
export const DEBIT_KINDS = ["staff_debit", "spent", "expired", "forfeited"] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];
export type DebitKind = (typeof DEBIT_KINDS)[number];
export type EntryKind = CreditKind | DebitKind;

/** Reasons back-office may choose when crediting, in the order the console lists them. */
export const STAFF_CREDIT_REASONS = ["late_delivery", "missing_item", "quality_issue", "goodwill", "correction", "other"] as const;
/** Reasons back-office may choose when debiting. */
export const STAFF_DEBIT_REASONS = ["credited_in_error", "correction", "other"] as const;
/** Reasons a platform flow may credit for. Closed: a new flow adds its own. */
export const AUTO_CREDIT_REASONS = ["courier_override_compensation"] as const;

/** Kinds whose reason is the kind itself. */
const FIXED: ReadonlySet<EntryKind> = new Set(["returned", "spent", "expired", "forfeited"]);

/** Whether `reason` may be recorded on an entry of `kind`. */
export function isValidReason(kind: EntryKind, reason: string): boolean {
  if (FIXED.has(kind)) return reason === kind;
  if (kind === "staff_credit") return (STAFF_CREDIT_REASONS as readonly string[]).includes(reason);
  if (kind === "staff_debit") return (STAFF_DEBIT_REASONS as readonly string[]).includes(reason);
  return (AUTO_CREDIT_REASONS as readonly string[]).includes(reason);
}

const CREDIT_WORDS: Readonly<Record<string, string>> = {
  late_delivery: "Sorry your order was late",
  missing_item: "For an item that didn't arrive",
  quality_issue: "For an item that wasn't right",
  goodwill: "A thank-you from Effy",
  correction: "Balance correction",
  other: "From Effy",
  courier_override_compensation: "Your delivery changed",
};

/** The sentence a customer reads for one history line. Names at most the order's own number, never a shop. */
export function customerWords(kind: EntryKind, reason: string, orderNumber: string | null): string {
  const on = orderNumber ? ` ${orderNumber}` : "";
  switch (kind) {
    case "spent":
      return `Used on order${on}`;
    case "returned":
      return `Returned from order${on}`;
    case "expired":
      return "Expired";
    case "forfeited":
      return "Account closed";
    case "staff_debit":
      return "Balance correction";
    default:
      return CREDIT_WORDS[reason] ?? "From Effy";
  }
}
