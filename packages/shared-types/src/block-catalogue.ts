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
 * ⚠ `hero` RESOLVED 2026-08-09 (operator decision, T008c). Two heroes existed — a static six-image
 * rotation and a promotions-driven carousel. The carousel wins and BOTH static heroes are deleted
 * from the storefront, so the platform now has exactly one.
 *
 * ⚠ THAT DECISION CHANGES WHERE THE HERO'S CONTENT COMES FROM, which is the part worth reading. The
 * live carousel is built from ADVERTISED PROMOTIONS — and 042 deletes the advertising facet on
 * discount codes outright. Carrying the hero over unchanged would leave the largest element on the
 * storefront fed by a column that no longer exists. So `hero` authors its own slides here, in the
 * composer, like every other block: the operator writes the words and attaches the artwork, and may
 * optionally LINK a promotion so the slide inherits that promotion's live window and stops showing
 * when it ends. The promotion becomes a schedule the slide can borrow, not the slide's content.
 */
export const BLOCK_TYPES = [
  "hero",
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
  /**
   * ⚠ ALT TEXT IS A FIELD AT ALL BECAUSE THE PLATFORM HAS NEVER HAD ONE. Both storefront banner
   * components hardcode `alt=""` today — artwork declared DECORATIVE — while the canvas definition
   * carries a marked text zone, which is the platform stating in its own contract that the artwork
   * CARRIES THE MESSAGE. A screen-reader user gets nothing from a promotional block that a sighted
   * shopper reads a headline off. Those two facts cannot both be right, and the canvas is the one
   * telling the truth.
   *
   * It is not `required: true` because a genuinely decorative image exists and forcing alt text onto
   * one produces the other failure — a screen reader reading out "abstract green pattern" between
   * every offer. `decorative` below is the deliberate opt-out, and the validator enforces that
   * exactly one of the two is answered (FR-026).
   */
  { kind: "text", key: "altText", label: "Alt text", required: false, maxLength: 140 },
  /**
   * ⚠ AN EXPLICIT OPT-OUT, NOT A DEFAULT. `alt=""` is the correct markup for decorative artwork and
   * the wrong markup for everything else — and it is what you get by forgetting. Making the operator
   * say so turns silence into a refusal instead of into the platform's current defect.
   */
  { kind: "boolean", key: "decorative", label: "Artwork is decorative", required: false },
  {
    kind: "reference",
    key: "promoCodeId",
    label: "Linked promotion",
    required: false,
    references: "promotion",
  },
]

/**
 * One full-bleed slide of the hero carousel.
 *
 * ⚠ NO `size`, UNLIKE AN OFFER TILE. Every slide fills the same box, so there is nothing to choose
 * and one canvas serves them all — which is also what lets the carousel crossfade without any slide
 * resizing under the one above it.
 *
 * ⚠ COPY SITS ON THE ARTWORK HERE, and this is the ONE PLACE ON THE PLATFORM WHERE THAT IS TRUE.
 * FR-007's research ranked "text outside the image" first and "a scrim over the artwork" last, and
 * the offers bento follows that ruling — an offer tile has no way to express "put the copy on the
 * photograph". A hero cannot: a full-bleed band with the words beside it is not a hero band, it is a
 * two-column banner. The exception is bounded by making the artwork requirement carry the burden
 * instead — `hero` artwork must be prepared with a clear region for type (the canvas declares one),
 * which is a rule about the ASSET rather than a control the operator can get wrong in the form.
 */
const HERO_SLIDE_FIELDS: readonly BlockField[] = [
  { kind: "text", key: "eyebrow", label: "Eyebrow", required: false, maxLength: 40 },
  { kind: "text", key: "headline", label: "Headline", required: true, maxLength: 60 },
  { kind: "longText", key: "supporting", label: "Supporting line", required: false, maxLength: 120 },
  // ⚠ The condition sentence, e.g. "On orders over $30". Optional, but when a slide carries a code
  // its terms are not — 029 shipped a promotion to the web surface WITHOUT its terms because the
  // banner face ignored the field, which is a discount advertised without the condition that binds it.
  { kind: "text", key: "terms", label: "Terms", required: false, maxLength: 90 },
  { kind: "text", key: "ctaLabel", label: "Button label", required: true, maxLength: 30 },
  { kind: "destination", key: "ctaDestination", label: "Button destination", required: true },
  { kind: "artwork", key: "artwork", label: "Artwork", required: true, canvas: "hero" },
  /**
   * ⚠ OPTIONAL, AND IT BUYS A SCHEDULE RATHER THAN CONTENT. Linking a promotion makes the slide
   * inherit that promotion's live window and exhaustion, so a slide advertising a code stops showing
   * itself the moment the code stops working. Unlinked, the slide is ordinary merchandising and stays
   * up until an operator takes it down.
   */
  { kind: "reference", key: "promoCodeId", label: "Linked promotion", required: false, references: "promotion" },
]

const HERO: BlockDefinition = {
  type: "hero",
  label: "Hero",
  resolution: "server-resolved",
  fields: [
    /**
     * ⚠ ONE SLIDE IS A VALID HERO, and the minimum is 1 rather than 2 for a reason: the alternative
     * is a store with one thing to say being unable to have a hero at all. With a single slide the
     * carousel does not rotate — there is nothing to rotate to — which is the correct behaviour and
     * not a special case in the renderer.
     *
     * ⚠ The maximum is 6 because the rotation's timing is a fixed cycle divided among the slides:
     * past six, each slide's turn is too short to read before it is replaced.
     */
    { kind: "list", key: "slides", label: "Slides", required: true, min: 1, max: 6, of: HERO_SLIDE_FIELDS },
  ],
  /**
   * ⚠ THE WORDS ARE PRE-FILLED; THE ARTWORK CANNOT BE. Every other field a preset can answer, it
   * answers — but `artwork` names a file that has to exist, and no preset can invent one. So a hero
   * added from a preset is one upload away from publishable rather than a blank form, and the single
   * refusal an operator meets names the one thing only they can supply.
   */
  presets: [
    {
      name: "Single promotional slide",
      props: {
        slides: [
          {
            eyebrow: "This week",
            headline: "Fresh in, delivered today",
            supporting: "Everything on the shelves, brought to your door.",
            ctaLabel: "Shop now",
            ctaDestination: { kind: "search" },
          },
        ],
      },
    },
  ],
}

const OFFERS: BlockDefinition = {
  type: "offers",
  label: "Offers",
  resolution: "server-resolved",
  fields: [
    { kind: "text", key: "title", label: "Section title", required: false, maxLength: 60 },
    { kind: "list", key: "tiles", label: "Tiles", required: true, min: 1, max: 6, of: OFFER_TILE_FIELDS },
  ],
  /**
   * ⚠ Same rule as the hero: the copy is pre-filled and the artwork is the operator's one required
   * act. Two tiles rather than the full five-tile composition — a bento degrades coherently with
   * fewer tiles (FR-018), and asking someone to source five photographs before they can publish
   * anything is how a feature goes unused.
   */
  presets: [
    {
      name: "Two offer tiles",
      props: {
        title: "Offers",
        tiles: [
          {
            size: "large",
            eyebrow: "Weekly deal",
            headline: "Save on the weekly shop",
            ctaLabel: "See the deals",
            ctaDestination: { kind: "sale" },
            ctaStyle: "button",
          },
          {
            size: "small",
            headline: "New this week",
            ctaLabel: "Browse",
            ctaDestination: { kind: "search" },
            ctaStyle: "link",
          },
        ],
      },
    },
  ],
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
  /**
   * ⚠ PRE-FILLED WITH THE PANELS THE STOREFRONT RENDERS TODAY, not an empty list. An empty `items`
   * would not merely be unhelpful — `items` is required with a minimum of one, so a block added from
   * a blank preset CANNOT BE PUBLISHED. The operator would add a section, be refused, and have to
   * work out from a validation message what a value panel is supposed to contain.
   */
  presets: [
    {
      name: "Three value panels",
      props: {
        items: [
          { headline: "One brand", supporting: "every product is Effy's own — no third-party sellers" },
          { headline: "No account", supporting: "needed to browse — we ask who you are when you order" },
          { headline: "Same day", supporting: "in serviced areas" },
        ],
      },
    },
  ],
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
  hero: HERO,
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
