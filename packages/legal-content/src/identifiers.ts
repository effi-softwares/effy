import raw from "./identifiers.json"

/**
 * Real-world identifiers referenced in the documents. `[BRACKETS]` values in identifiers.json are
 * placeholders `legal:check` refuses to publish; the operator replaces them. Nothing is inferred.
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
