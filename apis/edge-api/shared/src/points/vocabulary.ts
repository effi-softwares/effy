/**
 * The points vocabulary (074, research R11): what kinds of change exist, which reasons each may carry,
 * and the words a CUSTOMER is shown for each.
 *
 * ⚠ THE LISTS ARE CLOSED, and the database CHECK on points_entry.reason holds the same set. A new
 * automatic flow (080's courier override is the first) adds its reason here AND to that CHECK in its
 * own migration — never a free-text reason, because the customer's words are looked up from it.
 *
 * ⚠ THE STAFF NOTE IS NEVER A CUSTOMER WORD. A customer sees the sentence for the reason; the note is
 * internal context and stays in back-office.
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

export type StaffCreditReason = (typeof STAFF_CREDIT_REASONS)[number];
export type StaffDebitReason = (typeof STAFF_DEBIT_REASONS)[number];
export type AutoCreditReason = (typeof AUTO_CREDIT_REASONS)[number];

/** Kinds whose reason is the kind itself — nobody chooses it. */
const FIXED: ReadonlySet<EntryKind> = new Set(["returned", "spent", "expired", "forfeited"]);

export function isCreditKind(kind: string): kind is CreditKind {
  return (CREDIT_KINDS as readonly string[]).includes(kind);
}

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

/**
 * The sentence a customer reads for one history line. `orderNumber` is the order's own number, never
 * a shop's — an entry names at most one order and no shop.
 */
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
