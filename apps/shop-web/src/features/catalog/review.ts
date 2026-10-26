import { GST_STATUS_WORDS, STORAGE_WORDS, UNIT_BASIS_LABELS, type ShopReviewState } from "@effy/shared-types"

import { pathText, type ProductDetail, type ShopCategory } from "./model"

type ReviewTone = "brand" | "warning" | "muted"

interface ReviewChip {
  label: string
  tone: ReviewTone
}

export function reviewChip(state: ShopReviewState | undefined): ReviewChip | null {
  switch (state) {
    case "in_review":
      return { label: "In review", tone: "brand" }
    case "sent_back":
      return { label: "Sent back", tone: "warning" }
    case "live_change_pending":
      return { label: "Change in review", tone: "brand" }
    case "live_change_sent_back":
      return { label: "Change sent back", tone: "warning" }
    default:
      return null
  }
}

export function isApproved(detail: Pick<ProductDetail, "reviewState" | "status">): boolean {
  if (detail.reviewState === undefined) return detail.status !== "draft"
  return detail.reviewState.startsWith("live")
}

export const REVIEW_FILTERS: readonly { value: ShopReviewState; label: string }[] = [
  { value: "in_review", label: "In review" },
  { value: "sent_back", label: "Sent back" },
  { value: "live_change_pending", label: "Change in review" },
  { value: "live_change_sent_back", label: "Change sent back" },
]

/** The product as the shop is editing it: the live product with its pending change laid over. */
export function workingDetail(detail: ProductDetail): ProductDetail {
  const pending = detail.pendingChange
  if (!pending) return detail
  const { options: _options, variants: _variants, ...scalars } = pending.proposed
  return { ...detail, ...scalars, media: pending.media ?? detail.media } as ProductDetail
}

interface ProposedRow {
  label: string
  now: string
  proposed: string
}

const text = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "—" : String(v))

/** What a pending change proposes, as rows. `categories` names a proposed category when the tree is loaded. */
export function proposedRows(detail: ProductDetail, categories?: readonly ShopCategory[]): ProposedRow[] {
  const p = detail.pendingChange?.proposed
  if (!p) return []
  const rows: ProposedRow[] = []
  const add = (label: string, now: string, proposed: string) => rows.push({ label, now, proposed })

  if (p.name !== undefined) add("Name", detail.name, p.name)
  if (p.brand !== undefined) add("Brand", text(detail.brand), text(p.brand))
  if (p.shortDescription !== undefined) add("Short description", detail.shortDescription, p.shortDescription)
  if (p.longDescription !== undefined) add("Long description", text(detail.longDescription), text(p.longDescription))
  if (p.unitBasis !== undefined) {
    add(
      "Unit pricing",
      detail.unitBasis ? UNIT_BASIS_LABELS[detail.unitBasis] : "None",
      p.unitBasis ? UNIT_BASIS_LABELS[p.unitBasis] : "None",
    )
  }
  if (p.options && p.variants) {
    const liveSets = detail.variants.filter((v) => v.state !== "removed")
    const live = new Map(liveSets.map((v) => [v.id, v]))
    const kept = new Set(p.variants.map((v) => v.id))
    for (const v of p.variants) {
      const was = live.get(v.id)
      const label = was?.label ?? "Price"
      if (!was) add("A new size", "—", `${detail.currency} ${v.shopPriceAmount}`)
      else if (Number(was.shopPriceAmount) !== Number(v.shopPriceAmount))
        add(label, `${detail.currency} ${was.shopPriceAmount}`, `${detail.currency} ${v.shopPriceAmount}`)
      else if ((was.sku ?? "") !== (v.sku ?? "") || (was.gtin ?? "") !== (v.gtin ?? ""))
        add(`${label} codes`, text(was.sku ?? was.gtin), text(v.sku ?? v.gtin))
    }
    for (const v of liveSets)
      if (!kept.has(v.id)) add(`${v.label ?? "Variant"} (removed)`, `${detail.currency} ${v.shopPriceAmount}`, "—")
  }
  if (p.primaryCategoryId !== undefined) {
    const to = categories?.find((c) => c.id === p.primaryCategoryId)
    add("Category", pathText(detail.categoryPath), to ? pathText(to.path) : "A different category")
  }
  if (p.storage !== undefined) add("Storage", STORAGE_WORDS[detail.storage], STORAGE_WORDS[p.storage])
  if (p.gstStatus !== undefined) add("GST", GST_STATUS_WORDS[detail.gstStatus], GST_STATUS_WORDS[p.gstStatus])
  if (p.ageRestricted !== undefined) add("18+", detail.ageRestricted ? "Yes" : "No", p.ageRestricted ? "Yes" : "No")
  if (p.details !== undefined) add("Details", `${detail.details.length} set`, `${p.details.length} set (changed)`)
  if (detail.pendingChange?.media) {
    add("Images", `${detail.media.length}`, `${detail.pendingChange.media.length} (changed)`)
  }
  return rows
}
