import type { BlockType } from "./block-catalogue"

/**
 * THE STOREFRONT HOME LAYOUT (042) — the ordered list of blocks that composes the home page.
 *
 * Before this, the page's top-to-bottom order was a hardcoded sequence and the hero's words were
 * literals inside a component. This is the same page expressed as data.
 *
 * ⚠ STRUCTURED INTENT, NEVER RENDERED MARKUP. No HTML, no CSS, no inline styles are ever stored here.
 * Adobe Commerce persists XHTML and its own React client must re-parse it — a content type with no
 * React equivalent renders as a blank region. For this platform the choice is forced rather than
 * preferred: two of the six surfaces are Compose Multiplatform, so storing markup would make mobile
 * parity **unbuildable**, not merely awkward.
 */

/**
 * One block in a layout.
 *
 * ⚠ `props` is deliberately loose on the wire and strict on write. Validation happens once, at
 * publish, against the catalogue; the renderer is *tolerant* — an unknown type, a prop shape it does
 * not recognise, or a reference that has since disappeared drops that one block and serves the rest
 * (FR-042). A storefront that fails to render because one section is stale is a worse outcome than a
 * storefront missing one section.
 */
export interface LayoutBlock {
  /**
   * Stable and unique within the layout. Generated on insert, never reused, **never derived from
   * position** — it is what makes a reorder a reorder rather than a delete-plus-create, and what
   * keeps React keys and audit references meaningful across one.
   */
  id: string
  /** A member of the closed catalogue. Widened to `string` on read so an unknown type is data, not a parse error. */
  type: BlockType | (string & {})
  /**
   * Hidden blocks keep their content and render nothing (FR-005) — distinct from removal, so seasonal
   * content survives being taken down. ⚠ Hidden blocks are dropped SERVER-side, so a hidden block is
   * never on the wire and no client can render one by mistake.
   */
  hidden?: boolean
  props: Record<string, unknown>
}

/** A layout body: a flat, ordered array. Order IS array order — there is no position field. */
export type LayoutBody = LayoutBlock[]

/**
 * ⚠ There is no `position` integer, and that is a deliberate correction rather than an omission.
 * `promo_code.banner_position` exists today, is authored by an operator, stored, and transmitted —
 * and then **ignored by the web surface**, which slices by array index after filtering. One ordering
 * mechanism cannot disagree with itself; two always eventually do.
 */

/** How many blocks a layout may hold before publishing is refused (FR-009). */
export const MAX_BLOCKS_PER_LAYOUT = 20

/**
 * The layout as the back office sees it — both bodies, plus what is needed to write safely.
 *
 * ⚠ TWO BODIES, NO HISTORY. Schema evolution across historical revisions is the hardest problem in
 * block systems — Wagtail needed a migration framework for it, Gutenberg a `deprecated` sub-framework.
 * Because only `draft` and `published` ever exist, a block-shape change touches at most two rows and
 * is reachable by one forward migration. Adding history later re-opens that problem; do it
 * deliberately, not by accident.
 */
export interface HomeLayoutDTO {
  draft: LayoutBody
  published: LayoutBody
  /**
   * Optimistic concurrency (FR-017). Every mutating request carries the revision it last read; the
   * write is conditional on it. A stale write affects zero rows and is refused, so a second
   * operator's publish cannot silently discard the first's work.
   */
  revision: number
  publishedAt: string | null
  publishedBy: string | null
  updatedAt: string
  updatedBy: string | null
}

/**
 * The layout as the STOREFRONT sees it — published only, hidden blocks already dropped, references
 * already resolved.
 *
 * ⚠ There is no flag, header or query parameter that makes the public read return a draft. Draft
 * content is reachable only through an authenticated preview session (FR-022).
 */
export interface PublishedLayoutDTO {
  blocks: LayoutBlock[]
}

/** Why a block was dropped at render time — the label on `storefront_home_blocks_omitted_total`. */
export const BLOCK_OMISSION_REASONS = ["unknown_type", "invalid_props", "missing_reference"] as const
export type BlockOmissionReason = (typeof BLOCK_OMISSION_REASONS)[number]

/**
 * ⚠ Omission is a SILENT success path, which is why it is metered rather than merely handled.
 * FR-042 makes a bad block disappear so the page still renders — the failure mode that creates is a
 * storefront quietly missing a section with nothing anywhere reporting it.
 */

/** Refusal codes for a publish. One per rule, so the operator is told which block and which problem. */
export const LAYOUT_REFUSAL_CODES = [
  "layout_block_unknown",
  "layout_field_required",
  "layout_field_invalid",
  "layout_field_too_long",
  "layout_too_many_blocks",
  "layout_artwork_required",
  "layout_artwork_wrong_size",
  "layout_alt_text_required",
  "layout_reference_missing",
  "layout_heading_order",
  "layout_revision_stale",
] as const

export type LayoutRefusalCode = (typeof LAYOUT_REFUSAL_CODES)[number]

/**
 * ⚠ Every one of these is enforced in the SERVICE, not the form (FR-032). A check that exists only in
 * the composer is not a check — the operator can reach the API directly, and SC-007 proves each
 * refusal by doing exactly that.
 *
 * ⚠ There is no `layout_contrast_fail`. Copy never sits over artwork, so there is nothing to measure
 * — see the note on the offer tile in `block-catalogue.ts`.
 */
