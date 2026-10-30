import { identifiers } from "./identifiers"

/**
 * The seller identity a customer-facing document may show. A receipt renders today with or without the
 * operator's values, so each is shown when real and absent (null) otherwise: never blank, never the
 * bracketed placeholder, never a substitute.
 */

/** An unsupplied value reads as `[SOMETHING]`. */
export function isPlaceholder(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\[[A-Z_]+\]$/.test(value.trim())
}

/** The supplied value, or null. */
export function supplied(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed === "" || isPlaceholder(trimmed)) return null
  return trimmed
}

export interface SellerIdentity {
  /** Always present - the brand a customer knows. */
  tradingName: string
  /** The customer-facing mailbox. */
  supportEmail: string
  /** null until supplied. */
  legalEntityName: string | null
  /** null until supplied. */
  abn: string | null
  /** null until supplied. */
  registeredAddress: string | null
}

export function sellerIdentity(): SellerIdentity {
  return {
    tradingName: identifiers.tradingName,
    // `hello@` is the customer-facing address.
    supportEmail: identifiers.privacyContactEmail,
    legalEntityName: supplied(identifiers.legalEntityName),
    abn: supplied(identifiers.abn),
    registeredAddress: supplied(identifiers.registeredAddress),
  }
}
