/**
 * The source of truth for Effy's legal and informational documents. Web imports it; mobile uses the
 * generated Kotlin. src/generated/documents.ts is generated: run `pnpm --filter @effy/legal-content legal:gen`.
 */
import { documents } from "./generated/documents"
import type { DocumentSlug, LegalDocument } from "./types"

export * from "./types"
export { parseMarkdown, parseInline, MarkdownSubsetError } from "./markdown"
export { identifiers } from "./identifiers"
export type { Identifiers, IdentifierToken } from "./identifiers"
export { sellerIdentity, isPlaceholder, supplied } from "./seller"
export type { SellerIdentity } from "./seller"
export { dataTypes, subProcessors, retainedAfterDeletion, usedForTrackingAnywhere } from "./inventory"
export type { DataType, SubProcessor } from "./inventory"
export { manifest, requiredSlugs } from "./manifest"
export type { ManifestEntry } from "./manifest"

export { documents }

/** All documents in presentation order. */
export function allDocuments(): LegalDocument[] {
  return [...documents].sort((a, b) => a.order - b.order)
}

/** Look up one document by slug. Throws on an unknown slug (callers pass a validated `[type]`). */
export function getDocument(slug: string): LegalDocument {
  const doc = documents.find((d) => d.slug === slug)
  if (!doc) throw new Error(`Unknown legal document slug: ${slug}`)
  return doc
}

export function hasDocument(slug: string): slug is DocumentSlug {
  return documents.some((d) => d.slug === slug)
}

/** Version history for a document, newest first (includes the current version). */
export function getVersions(slug: string) {
  return getDocument(slug).versions
}
