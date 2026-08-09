/**
 * THE BLOCK CATALOGUE — the closed set of things a storefront home layout can contain (042).
 *
 * ⚠ THIS IS THE SINGLE SOURCE OF TRUTH, and it is consumed by three places that must never disagree:
 * the back-office form that authors a block, the cold-path validator that refuses a bad one, and the
 * hot-path renderer that serves it. A block that saves cleanly and renders as nothing is the failure
 * this file exists to prevent, and it is exactly what three parallel definitions produce.
 *
 * ⚠ WHY THE FIELD-KIND LIST IS CLOSED, AND WHY A TEST ASSERTS ITS LENGTH.
 *
 * The constitution's monochrome rule (Principle V) is enforced by `check-tokens`, which scans SOURCE.
 * A colour stored in a database row is invisible to it. So the design-system guarantee holds here only
 * because there is **no field kind capable of carrying a colour** — no colour, no size, no spacing, no
 * free-form rich text. That is a *negative* property: it is true until someone adds a ninth kind, and
 * nothing else on the platform would notice. `block-catalogue.test.ts` pins the vocabulary for that
 * reason, not for tidiness.
 */

/* ── Field kinds ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Every kind a block field may be. Closed by design — see the header.
 *
 * ⚠ Adding to this list is a constitutional question, not a typing exercise.
 */
export const FIELD_KINDS = [
  "text",
  "longText",
  "enum",
  "boolean",
  "reference",
  "destination",
  "artwork",
  "list",
] as const

export type FieldKind = (typeof FIELD_KINDS)[number]

/**
 * ⚠ A compile-time restatement of the count the guard test asserts at runtime.
 *
 * Both exist deliberately: this fails `tsc` the moment a kind is added or removed, and the test fails
 * with a message naming the rule. One catches it in the editor, the other explains it in CI.
 */
export const FIELD_KIND_COUNT: 8 = FIELD_KINDS.length

/** What a reference points at. Resolved at render, validated at publish — never stored by name. */
export const REFERENCE_KINDS = ["rail", "category", "product", "promotion"] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

/**
 * Where a call to action leads.
 *
 * ⚠ NARROWED FROM FIVE KINDS TO FOUR. `BannerTarget` also carries `promotion`, and 042 retires the
 * promotion-detail page it pointed at — so keeping it would let an operator author a tile aimed at a
 * route that no longer exists. That is precisely the defect 029 fixed (every banner pointed at
 * `/search` for its whole life) and this feature claims to remove.
 */
export const DESTINATION_KINDS = ["search", "sale", "category", "product"] as const
export type DestinationKind = (typeof DESTINATION_KINDS)[number]

/* ── Field descriptors ───────────────────────────────────────────────────────────────────────── */

interface FieldBase {
  readonly key: string
  readonly required: boolean
  /** Operator-facing label. Not shopper-visible. */
  readonly label: string
}

export interface TextField extends FieldBase {
  readonly kind: "text" | "longText"
  /**
   * ⚠ ENFORCED SERVER-SIDE by `layout_field_too_long`, not just by the input's `maxlength`.
   * A limit that exists only in the composer is not a limit — the operator can reach the API directly
   * (FR-032), and SC-007 proves every refusal outside the form.
   */
  readonly maxLength: number
}

export interface EnumField extends FieldBase {
  readonly kind: "enum"
  readonly options: readonly { readonly value: string; readonly label: string }[]
}

export interface BooleanField extends FieldBase {
  readonly kind: "boolean"
}

export interface ReferenceField extends FieldBase {
  readonly kind: "reference"
  readonly references: ReferenceKind
}

export interface DestinationField extends FieldBase {
  readonly kind: "destination"
}

export interface ArtworkField extends FieldBase {
  readonly kind: "artwork"
  /** Which canvas the artwork must conform to. A key into the canvas set, never a literal size. */
  readonly canvas: string
}

export interface ListField extends FieldBase {
  readonly kind: "list"
  readonly min: number
  readonly max: number
  readonly of: readonly BlockField[]
}

export type BlockField =
  | TextField
  | EnumField
  | BooleanField
  | ReferenceField
  | DestinationField
  | ArtworkField
  | ListField

/* ── Block types ─────────────────────────────────────────────────────────────────────────────── */

/**
 * The closed catalogue.
 *
 * ⚠ RECONCILED AGAINST THE REAL PAGE (T008a), not against the plan's assumption. `HomeSection` has
 * three kinds; the rest were page-level JSX. `recently_viewed` is here because it renders on the page
 * today and was missing from every earlier draft — omitting it would mean an operator reorders the
 * home page and one section inexplicably refuses to move.
 *
 * ⚠ `hero` is DEFERRED. Two heroes exist — a static one (commented out) and a promotions-driven one
 * (live) — and the comparison between them was never concluded. Its field schema depends entirely on
 * which wins, so guessing it would be inventing a requirement. Tracked as T008c.
 */
export const BLOCK_TYPES = [
  "category_strip",
  "product_rail",
  "offers",
  "value_strip",
  "app_promo",
  "newsletter",
  "recently_viewed",
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

/** How a block's content is resolved when the page renders. */
export type BlockResolution =
  /** Content comes entirely from the block's own props. */
  | "static"
  /** Props carry references; the hot path resolves them into content at render. */
  | "server-resolved"
  /**
   * ⚠ Content is resolved IN THE BROWSER from device-local state and cannot be server-rendered.
   * Only the block's POSITION is authorable. `recently_viewed` reads `localStorage`, so there is
   * nothing for an operator to author beyond where it sits.
   */
  | "client-island"

export interface BlockDefinition {
  readonly type: BlockType
  readonly label: string
  readonly resolution: BlockResolution
  readonly fields: readonly BlockField[]
  /**
   * At least one preset per type (FR-003) — a block pre-filled with representative content.
   *
   * ⚠ Never a blank shell. This is the highest-leverage feature in the taxonomy for a single
   * operator and the most commonly skipped: a preset turns a layout decision into one click, whereas
   * a blank block turns every publish into a design session.
   */
  readonly presets: readonly { readonly name: string; readonly props: Record<string, unknown> }[]
}

const CATEGORY_STRIP: BlockDefinition = {
  type: "category_strip",
  label: "Category shortcuts",
  resolution: "server-resolved",
  fields: [
    { kind: "text", key: "title", label: "Title", required: true, maxLength: 60 },
    { kind: "text", key: "viewAllLabel", label: "View-all link", required: false, maxLength: 40 },
  ],
  presets: [{ name: "Shop by category", props: { title: "Shop by category", viewAllLabel: "View all categories" } }],
}

const PRODUCT_RAIL: BlockDefinition = {
  type: "product_rail",
  label: "Product rail",
  resolution: "server-resolved",
  fields: [
    { kind: "reference", key: "railKey", label: "Rail", required: true, references: "rail" },
    { kind: "text", key: "title", label: "Title override", required: false, maxLength: 60 },
  ],
  presets: [
    { name: "On sale", props: { railKey: "on_sale" } },
    { name: "Featured", props: { railKey: "featured" } },
  ],
}

/**
 * One tile in the offers bento.
 *
 * ⚠ There is no `overlay` variant and no text-over-artwork anywhere in this shape. Copy sits on a
 * solid, token-coloured panel beside the artwork, so its contrast is a property of the design system
 * rather than of an operator's photograph. That is not an aesthetic preference: validating text over
 * a photograph requires decoding its pixels, and this platform deliberately has no decoder
 * (`image-dimensions.ts` is a header reader written specifically to avoid `sharp`). Placing copy
 * beside the artwork removes the requirement instead of deferring it — and copy-outside-image is the
 * arrangement ranked most common across the retailers surveyed, with a scrim ranked least.
 */
const OFFER_TILE_FIELDS: readonly BlockField[] = [
  {
    kind: "enum",
    key: "size",
    label: "Tile size",
    required: true,
    options: [
      { value: "large", label: "Large" },
      { value: "wide", label: "Wide" },
      { value: "small", label: "Small" },
      { value: "tall", label: "Tall" },
    ],
  },
  { kind: "text", key: "eyebrow", label: "Eyebrow", required: false, maxLength: 40 },
  { kind: "text", key: "headline", label: "Headline", required: true, maxLength: 60 },
  { kind: "longText", key: "supporting", label: "Supporting line", required: false, maxLength: 120 },
  { kind: "text", key: "ctaLabel", label: "Button label", required: true, maxLength: 30 },
  { kind: "destination", key: "ctaDestination", label: "Button destination", required: true },
  {
    kind: "enum",
    key: "ctaStyle",
    label: "Button style",
    required: true,
    options: [
      { value: "button", label: "Button" },
      { value: "link", label: "Text link" },
    ],
  },
  // ⚠ The canvas is chosen from `size` at validation time; "tile" is the family, not a literal shape.
  { kind: "artwork", key: "artwork", label: "Artwork", required: true, canvas: "tile" },
  {
    kind: "reference",
    key: "promoCodeId",
    label: "Linked promotion",
    required: false,
    references: "promotion",
  },
]

const OFFERS: BlockDefinition = {
  type: "offers",
  label: "Offers",
  resolution: "server-resolved",
  fields: [
    { kind: "text", key: "title", label: "Section title", required: false, maxLength: 60 },
    { kind: "list", key: "tiles", label: "Tiles", required: true, min: 1, max: 6, of: OFFER_TILE_FIELDS },
  ],
  presets: [{ name: "Offers", props: { title: "Offers", tiles: [] } }],
}

const VALUE_STRIP: BlockDefinition = {
  type: "value_strip",
  label: "Value strip",
  resolution: "static",
  fields: [
    {
      kind: "list",
      key: "items",
      label: "Items",
      required: true,
      min: 1,
      max: 3,
      of: [
        { kind: "text", key: "headline", label: "Headline", required: true, maxLength: 40 },
        { kind: "longText", key: "supporting", label: "Supporting line", required: false, maxLength: 90 },
      ],
    },
  ],
  presets: [{ name: "Three value panels", props: { items: [] } }],
}

const APP_PROMO: BlockDefinition = {
  type: "app_promo",
  label: "App promotion",
  resolution: "static",
  fields: [
    { kind: "text", key: "headline", label: "Headline", required: true, maxLength: 60 },
    { kind: "longText", key: "supporting", label: "Supporting line", required: false, maxLength: 160 },
  ],
  presets: [{ name: "App is on its way", props: { headline: "The Effy app is on its way" } }],
}

const NEWSLETTER: BlockDefinition = {
  type: "newsletter",
  label: "Newsletter",
  resolution: "static",
  fields: [
    { kind: "text", key: "headline", label: "Headline", required: true, maxLength: 60 },
    { kind: "longText", key: "supporting", label: "Supporting line", required: false, maxLength: 160 },
  ],
  presets: [{ name: "Keep up with Effy", props: { headline: "Keep up with Effy" } }],
}

/**
 * ⚠ NO AUTHORABLE FIELDS, ON PURPOSE. Its content is the shopper's own recently-viewed list, read
 * from device storage in the browser. Only its POSITION is authorable — which is the whole reason it
 * is a block at all rather than page JSX: without it, an operator reorders the home page and this one
 * section refuses to move, with no explanation available to them.
 */
const RECENTLY_VIEWED: BlockDefinition = {
  type: "recently_viewed",
  label: "Recently viewed",
  resolution: "client-island",
  fields: [],
  presets: [{ name: "Recently viewed", props: {} }],
}

export const BLOCK_CATALOGUE: Readonly<Record<BlockType, BlockDefinition>> = {
  category_strip: CATEGORY_STRIP,
  product_rail: PRODUCT_RAIL,
  offers: OFFERS,
  value_strip: VALUE_STRIP,
  app_promo: APP_PROMO,
  newsletter: NEWSLETTER,
  recently_viewed: RECENTLY_VIEWED,
}

/** Look up a definition, or `null` for a type this build does not know. */
export function blockDefinition(type: string): BlockDefinition | null {
  return (BLOCK_CATALOGUE as Record<string, BlockDefinition | undefined>)[type] ?? null
}

/** Every field a type declares, flattened one level into list sub-fields. */
export function fieldsFor(type: BlockType): readonly BlockField[] {
  return BLOCK_CATALOGUE[type].fields
}
