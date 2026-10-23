import raw from "./manifest.json"
import type { DocumentCategory, DocumentSlug } from "./types"

/**
 * The documents that must exist (mirrored in manifest.json for the generator). `legal:check` fails on a
 * slug with no document or a document not listed. Order and category drive the `/legal` index and footer.
 */
export interface ManifestEntry {
  slug: DocumentSlug
  category: DocumentCategory
  order: number
}

export const manifest: ManifestEntry[] = raw as ManifestEntry[]

export const requiredSlugs: DocumentSlug[] = manifest.map((m) => m.slug)
