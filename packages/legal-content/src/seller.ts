import { identifiers } from "./identifiers"

/**
 * THE SELLER IDENTITY a customer-facing document may show (052 FR-030/FR-031).
 *
 * ── ⚠ Why this exists rather than each surface reading `identifiers` directly ────────────────────
 *
 * `identifiers.json` carries FAIL-LOUD PLACEHOLDERS — `[LEGAL_ENTITY_NAME]`, `[ABN]`,
 * `[REGISTERED_ADDRESS]` — which the constitution's Real-World Identifiers rule requires: a value
 * nobody has supplied must never be guessed. `legal:check` refuses to publish a legal DOCUMENT while
 * one remains.
 *
 * A receipt is different: it must render TODAY, with or without those values. So the rule it needs is
 * "show it when it is real, omit it entirely when it is not" — and FR-031 is specific that the field
 * must be ABSENT, not blank and not the bracketed text. Putting that decision in one function means
 * three surfaces cannot each get it subtly wrong, and a fourth cannot forget it exists.
 *
 * ⚠ Nothing here ever falls back to a plausible-looking substitute. An unsupplied ABN yields `null`,
 * and every caller renders nothing.
 */

/** A value the operator has not yet supplied reads as `[SOMETHING]` — never show it to anyone. */
export function isPlaceholder(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\[[A-Z_]+\]$/.test(value.trim())
}

/** The supplied value, or null. ⚠ Never a guess, never the bracketed text, never an empty string. */
export function supplied(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed === "" || isPlaceholder(trimmed)) return null
  return trimmed
}

export interface SellerIdentity {
  /** Always present — the brand a customer knows. */
  tradingName: string
  /** The customer-facing mailbox (constitution: `hello@` is the one people outside Effy see). */
  supportEmail: string
  /** ⚠ null until the operator supplies it. Renders as nothing. */
  legalEntityName: string | null
  /** ⚠ null until the operator supplies it. Its absence is why this is not a tax invoice. */
  abn: string | null
  /** ⚠ null until the operator supplies it. Renders as nothing. */
  registeredAddress: string | null
}

export function sellerIdentity(): SellerIdentity {
  return {
    tradingName: identifiers.tradingName,
    // ⚠ `hello@`, not `support@`: the constitution names it as the customer-facing address, and this
    // is the one a shopper reads on their receipt.
    supportEmail: identifiers.privacyContactEmail,
    legalEntityName: supplied(identifiers.legalEntityName),
    abn: supplied(identifiers.abn),
    registeredAddress: supplied(identifiers.registeredAddress),
  }
}

/**
 * Whether this platform can currently issue a compliant Australian TAX INVOICE.
 *
 * ⚠ FALSE TODAY, and it is not one gap but TWO (research R13):
 *
 *   1. The ABN is unsupplied. The ATO requires the seller's ABN on a tax invoice, and the constitution
 *      forbids inferring a real-world identifier. **Operator input, not engineering work.**
 *   2. ⚠ Per-item GST treatment is unmodelled — and for a GROCER this is the harder one. Basic food is
 *      GST-free in Australia, so an Effy basket is a MIXED SUPPLY: the "total price includes GST"
 *      shorthand is FALSE for most orders, and the "extent to which each sale is taxable" requirement
 *      cannot be met from data that does not exist.
 *
 * ⚠ This function deliberately returns false even once the ABN lands, because (2) is independent of
 * it. Whoever supplies the ABN and expects tax invoices to start appearing should find this comment.
 */
export function canIssueTaxInvoice(): boolean {
  // Gap 2 is unmodelled platform-wide; there is no data to consult, so this cannot yet be true.
  return false
}
