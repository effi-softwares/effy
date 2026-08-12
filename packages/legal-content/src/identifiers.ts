import raw from "./identifiers.json"

/**
 * Real-world identifiers referenced across the documents (constitution § Real-World Identifiers).
 *
 * ⚠ Values in `[BRACKETS]` in identifiers.json are FAIL-LOUD PLACEHOLDERS. `legal:check` refuses to
 * pass while any remains in generated output, so the documents cannot be published with a guessed
 * identity. The operator replaces each placeholder in identifiers.json with a real, lawyer-confirmed
 * value; nothing here is inferred.
 *
 * Non-placeholder values are OPERATOR-CHOSEN and already live in the platform: `effyshopping.com` is
 * the registered domain (CLAUDE.md), `support@effyshopping.com` already ships in the delete-account
 * page, and `hello@effyshopping.com` is the approved customer-facing mailbox (constitution).
 */

export interface Identifiers {
  legalEntityName: string
  tradingName: string
  abn: string
  registeredAddress: string
  governingLawState: string
  governingLawCountry: string
  privacyContactEmail: string
  supportContactEmail: string
  websiteUrl: string
  canonicalHost: string
}

export const identifiers: Identifiers = raw

/** The token syntax used inside document Markdown: `{{legalEntityName}}`. */
export type IdentifierToken = keyof Identifiers
