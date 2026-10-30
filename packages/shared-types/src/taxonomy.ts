import type { ListPage } from "./list"
/**
 * The catalogue taxonomy (101): one category tree of at most five levels; a product is filed in exactly one
 * leaf, and that leaf's resolved form - attributes attached to it and its ancestors, tightened or hidden on
 * the way down - is what a shop fills in. Staff manage the tree, the attribute library and the attachments
 * in back-office (`catalog` service); shops read the tree and a leaf's form (`shop` service).
 *
 * Storage, GST status and age-restricted are fixed product facts, not attributes; a category may default
 * each, and its descendants inherit the nearest default.
 */
import type { WireInt } from "./cart"
import type { CategoryIcon } from "./category-icons"
import type { GstStatus } from "./documents"
import type { UnitFamily } from "./units"

export type InputType =
  | "short_text"
  | "long_text"
  | "number"
  | "boolean"
  | "single_select"
  | "multi_select"
  | "date"
  | "time"

export const INPUT_TYPES: readonly InputType[] = [
  "short_text",
  "long_text",
  "number",
  "boolean",
  "single_select",
  "multi_select",
  "date",
  "time",
]

export const INPUT_TYPE_WORDS: Record<InputType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  boolean: "Yes / no",
  single_select: "Single choice",
  multi_select: "Multiple choice",
  date: "Date",
  time: "Time",
}

/** Which input types may be a storefront filter, differ per variant, or be a variant option. */
export const FILTERABLE_INPUT_TYPES: readonly InputType[] = ["single_select", "multi_select", "boolean", "number"]
export const CHOICE_INPUT_TYPES: readonly InputType[] = ["single_select", "multi_select"]

export type AttributeLevel = "required" | "recommended" | "optional"

/** Loosest first: a child category may only move an inherited attribute rightwards. */
export const LEVEL_ORDER: readonly AttributeLevel[] = ["optional", "recommended", "required"]

export function levelRank(level: AttributeLevel): number {
  return LEVEL_ORDER.indexOf(level)
}

export const LEVEL_WORDS: Record<AttributeLevel, string> = {
  required: "Required",
  recommended: "Recommended",
  optional: "Optional",
}

export type Storage = "frozen" | "chilled" | "ambient"
export const STORAGES: readonly Storage[] = ["ambient", "chilled", "frozen"]

/** The one way storage is said, on every screen. The stored word `ambient` is never shown. */
export const STORAGE_WORDS: Record<Storage, string> = {
  ambient: "Room temperature",
  chilled: "Chilled",
  frozen: "Frozen",
}

export type TaxonomyStatus = "active" | "retired"

export const CATEGORY_DEPTH_MAX = 5
export const PLACEMENTS_MAX = 5
export const SYNONYMS_MAX = 30
export const CATEGORY_NAME_MAX = 60
export const ATTRIBUTE_NAME_MAX = 60
export const VALUE_LABEL_MAX = 40
export const SECTION_MAX = 40
export const DEFAULT_SECTION = "Details"

/** A category's defaults for the three product facts; null = not set here (inherit). */
export interface FactDefaults {
  storage: Storage | null
  gstStatus: GstStatus | null
  ageRestricted: boolean | null
}

// ── Back-office: the tree ───────────────────────────────────────────────────────────────────────────────

export interface TaxonomyCategoryDTO {
  id: string
  parentId: string | null
  key: string
  name: string
  position: WireInt
  status: TaxonomyStatus
  icon: CategoryIcon | null
  imageKey: string | null
  /** The picture at its public address; null without one. */
  imageUrl: string | null
  synonyms: string[]
  /** What this category sets itself. */
  defaults: FactDefaults
  /** What applies here after inheritance; null for a retired category. */
  resolved: FactDefaults | null
  /** Non-archived products whose home is this category or one beneath it. */
  productCount: WireInt
  /** Extra placements into this category or one beneath it. */
  placementCount: WireInt
}

export interface TaxonomyTreeDTO {
  categories: TaxonomyCategoryDTO[]
}

export interface CreateCategoryRequest {
  parentId: string | null
  name: string
  icon?: CategoryIcon | null
  synonyms?: string[]
  defaults?: Partial<FactDefaults>
  /** Consent to move the parent's products into the new category (the parent stops being a leaf). */
  moveProductsToSelf?: boolean
}

export interface UpdateCategoryRequest {
  name?: string
  icon?: CategoryIcon | null
  imageKey?: string | null
  synonyms?: string[]
  /** A key set to null goes back to inheriting. */
  defaults?: Partial<FactDefaults>
}

export interface MoveCategoryRequest {
  parentId: string | null
  /** Zero-based place among the new siblings. */
  position: WireInt
}

export interface SetCategoryStatusRequest {
  status: TaxonomyStatus
  /** Restoring under a parent that is home to products: consent to move them into the restored category. */
  moveProductsToSelf?: boolean
}

export interface CategoryImageUploadRequest {
  contentType: string
  /** Bytes; up to 10 MB. */
  fileSize: number
}

export interface CategoryImageUploadResponse {
  uploadUrl: string
  imageKey: string
}

// ── Back-office: the attribute library ──────────────────────────────────────────────────────────────────

export interface AttributeValueDTO {
  id: string
  label: string
  position: WireInt
  status: TaxonomyStatus
  /** Products using it (back-office only). */
  usage?: WireInt
}

export interface AttributeDTO {
  id: string
  key: string
  name: string
  helpText: string | null
  inputType: InputType
  unitFamily: UnitFamily | null
  /** Allowed units, the first the default. */
  units: string[]
  /** Limits for numbers, in the family's base unit. */
  min: string | null
  max: string | null
  decimals: WireInt | null
  maxLength: WireInt | null
  filterable: boolean
  customerVisible: boolean
  variesByVariant: boolean
  variantOption: boolean
  status: TaxonomyStatus
  values: AttributeValueDTO[]
  usage: { categories: WireInt; products: WireInt }
}

export interface AttributeInput {
  name: string
  helpText?: string | null
  inputType: InputType
  unitFamily?: UnitFamily | null
  units?: string[] | null
  min?: string | null
  max?: string | null
  decimals?: WireInt | null
  maxLength?: WireInt | null
  filterable: boolean
  customerVisible: boolean
  variesByVariant: boolean
  variantOption: boolean
  /** Choice types: the full ordered list. A value missing from it is deleted (refused while used). */
  values?: { id?: string; label: string; status?: TaxonomyStatus }[]
}

export type UpdateAttributeRequest = Partial<AttributeInput>

export interface SetAttributeStatusRequest {
  status: TaxonomyStatus
}

// ── Attachments and the resolved form ───────────────────────────────────────────────────────────────────

export interface AttachmentInput {
  level?: AttributeLevel
  hidden?: boolean
  section?: string | null
  position?: WireInt | null
}

/** One attribute in a resolved form. */
export interface CategoryFormRow {
  attributeId: string
  key: string
  name: string
  helpText: string | null
  inputType: InputType
  unitFamily: UnitFamily | null
  units: string[]
  min: string | null
  max: string | null
  decimals: WireInt | null
  maxLength: WireInt | null
  /** Active values only, in order. */
  values: { id: string; label: string }[]
  level: AttributeLevel
  section: string
  position: WireInt
  filterable: boolean
  customerVisible: boolean
  variesByVariant: boolean
  variantOption: boolean
  /** Back-office only: the category that set or last tightened it. */
  sourceCategoryId?: string
  sourceCategoryName?: string
}

export interface CategoryFormSection {
  title: string
  rows: CategoryFormRow[]
}

/** A category's own attachment (back-office). */
export interface OwnAttachmentDTO {
  attributeId: string
  name: string
  level: AttributeLevel | null
  hidden: boolean
  section: string | null
  position: WireInt | null
}

export interface CategoryFormDTO {
  categoryId: string
  path: string[]
  isLeaf: boolean
  sections: CategoryFormSection[]
  /** The resolved defaults a new product here starts from. */
  defaults: FactDefaults
  /** Back-office only. */
  own?: OwnAttachmentDTO[]
}

// ── Shop: the tree for the category picker ──────────────────────────────────────────────────────────────

export interface ShopTaxonomyCategoryDTO {
  id: string
  parentId: string | null
  name: string
  /** Names from the department to this category. */
  path: string[]
  isLeaf: boolean
  synonyms: string[]
  icon: CategoryIcon | null
}

export interface ShopTaxonomyDTO {
  categories: ShopTaxonomyCategoryDTO[]
  /** The shop's most recently used leaves, newest first (at most five). */
  recentLeafIds: string[]
}

// ── Product details (a product's values for its form) ───────────────────────────────────────────────────

/** Exactly one key is set, matching the attribute's input type. Numbers travel as decimal strings. */
export type DetailValue =
  | { text: string }
  | { number: string; unit?: string | null }
  | { boolean: boolean }
  | { valueIds: string[] }
  | { date: string }
  | { time: string }

/** One attribute's value: for the whole product, or one per variant ("differs by variant"). */
export interface DetailInput {
  attributeId: string
  value?: DetailValue
  perVariant?: { variantId: string; value: DetailValue }[]
}

// ── Placements and the missing-details list (back-office) ───────────────────────────────────────────────

export interface SetPlacementsRequest {
  categoryIds: string[]
}

export interface PlacementsDTO {
  categoryIds: string[]
}

export interface MissingDetailsItemDTO {
  productId: string
  shopName: string
  name: string
  categoryPath: string[]
  missing: string[]
}

/** A console list page (103). */
export type MissingDetailsPageDTO = ListPage<MissingDetailsItemDTO>
