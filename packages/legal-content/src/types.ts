/**
 * The content model for Effy's legal & informational documents.
 * See specs/045-legal-documentation/data-model.md — this is a CONTENT model, not a DB schema.
 */

export type DocumentSlug =
  | "privacy-policy"
  | "terms-of-service"
  | "refunds-returns"
  | "delivery-policy"
  | "promotions-terms"
  | "food-safety-allergens"
  | "cookies-tracking"
  | "acceptable-use"
  | "eula"
  | "acknowledgements"
  | "about"

/** `legal` = an agreement/notice; `info` = informational (about, acknowledgements). */
export type DocumentCategory = "legal" | "info"

export interface DocumentVersion {
  version: string // v1, v2, …
  effectiveDate: string // ISO date (YYYY-MM-DD)
  status: "current" | "superseded"
  /** The raw Markdown body (constrained subset — see markdown.ts) with identifiers already substituted. */
  body: string
}

export interface LegalDocument {
  slug: DocumentSlug
  title: string
  category: DocumentCategory
  order: number
  currentVersion: string
  effectiveDate: string
  body: string // current version body
  versions: DocumentVersion[] // newest first, includes current
}

/** ---- Constrained Markdown subset (parsed once here, rendered on web + mobile) ---- */

export interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  href?: string
}

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; runs: InlineRun[] }
  | { kind: "paragraph"; runs: InlineRun[] }
  | { kind: "list"; ordered: boolean; items: InlineRun[][] }
  | { kind: "table"; header: InlineRun[][]; rows: InlineRun[][][] }
