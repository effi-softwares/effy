import raw from "./manifest.json"
import type { DocumentCategory, DocumentSlug } from "./types"

/**
 * The registry of documents that MUST exist (mirrored in manifest.json so the Node generator reads the
 * same source). `legal:check` fails if a slug here has no document directory/current version, or if a
 * document exists that is not listed here. Order + category drive the `/legal` index and footer.
 */
export interface ManifestEntry {
  slug: DocumentSlug
  category: DocumentCategory
  order: number
}

export const manifest: ManifestEntry[] = raw as ManifestEntry[]

export const requiredSlugs: DocumentSlug[] = manifest.map((m) => m.slug)
