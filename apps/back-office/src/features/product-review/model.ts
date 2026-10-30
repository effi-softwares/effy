import {
  GST_STATUS_WORDS,
  STORAGE_WORDS,
  type FactKey,
  type MarginDTO,
  type ReviewItemDetailDTO,
  type ReviewKind,
} from "@effy/shared-types"

export const KIND_LABEL: Record<ReviewKind, string> = {
  new_product: "New product",
  change: "Change",
}

export function waitingLabel(hours: number): string {
  if (hours < 1) return "Under an hour"
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? "1 day" : `${days} days`
}

export function marginLabel(m: MarginDTO | null): string {
  if (!m) return "Not set"
  return m.kind === "percent" ? `${m.value}%` : `+ ${m.value}`
}

export function previewCustomerPrice(shopPrice: string, kind: "percent" | "amount", value: string): string | null {
  const v = value.trim()
  if (!/^\d+(\.\d+)?$/.test(v) || !/^\d+(\.\d{1,2})?$/.test(shopPrice)) return null
  const shopCents = Math.round(Number(shopPrice) * 100)
  const cents =
    kind === "amount"
      ? shopCents + Math.round(Number(v) * 100)
      : shopCents + Math.floor((shopCents * Number(v)) / 100 + 0.5)
  if (!Number.isFinite(cents)) return null
  return (cents / 100).toFixed(2)
}

export function priceRange(prices: readonly string[]): string {
  if (prices.length === 0) return "-"
  const sorted = [...prices].sort((a, b) => Number(a) - Number(b))
  const lo = sorted[0]!
  const hi = sorted[sorted.length - 1]!
  return Number(lo) === Number(hi) ? lo : `${lo}–${hi}`
}

export type MarginEntry = { kind: "percent" | "amount"; value: string }

export function toMargin(entry: MarginEntry): MarginDTO | null {
  const v = entry.value.trim()
  return /^\d+(\.\d+)?$/.test(v) ? { kind: entry.kind, value: v } : null
}

/**
 * What a reviewer should look at first (101): facts the shop changed from its category's defaults, required
 * details still empty (approval is refused), and recommended ones left empty (never blocking).
 */
export function attentionLines(
  item: Pick<ReviewItemDetailDTO, "facts" | "factOverrides" | "missingRequired" | "missingRecommended">,
): {
  blocking: string[]
  notes: string[]
} {
  const fact: Record<FactKey, string> = {
    storage: `Storage is ${STORAGE_WORDS[item.facts.storage].toLowerCase()}, not its category's default.`,
    gstStatus: `GST is ${GST_STATUS_WORDS[item.facts.gstStatus]}, not its category's default.`,
    ageRestricted: item.facts.ageRestricted
      ? "Marked 18+, which its category is not."
      : "Not marked 18+, though its category is.",
  }
  return {
    blocking:
      item.missingRequired.length > 0 ? [`Required details are empty: ${item.missingRequired.join(", ")}.`] : [],
    notes: [
      ...item.factOverrides.map((k) => fact[k]),
      ...(item.missingRecommended.length > 0
        ? [`Recommended details left empty: ${item.missingRecommended.join(", ")}.`]
        : []),
    ],
  }
}

// The review page (redesign): where a change is shown, how a text changed, how far a price moved, what to check.

export type ReviewSection = "changes" | "pictures" | "sizes" | "about" | "details" | "aisles"

/** Where on the review page a changed field is marked: its section. */
export function sectionOfChange(field: string): ReviewSection {
  if (field === "options" || field === "unitBasis" || field.startsWith("variant:")) return "sizes"
  if (field === "name" || field === "brand" || field === "shortDescription" || field === "longDescription")
    return "about"
  if (field === "primaryCategoryId") return "aisles"
  return "details"
}

export const SECTION_WORDS: Record<ReviewSection, string> = {
  changes: "What changed",
  pictures: "Pictures",
  sizes: "Sizes and prices",
  about: "Description",
  details: "Details",
  aisles: "Aisles",
}

export interface DiffPart {
  text: string
  /** Removed (in the old text) or added (in the new). */
  changed: boolean
}

/**
 * A word-level diff of two texts: what was removed from the first and what was added in the second, the words they
 * share left plain. Whitespace is kept as its own part, so the texts read as written.
 */
export function wordDiff(before: string, after: string): { was: DiffPart[]; now: DiffPart[] } {
  const a = before.split(/(\s+)/).filter((t) => t !== "")
  const b = after.split(/(\s+)/).filter((t) => t !== "")
  const n = a.length
  const m = b.length
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const was: DiffPart[] = []
  const now: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      was.push({ text: a[i]!, changed: false })
      now.push({ text: b[j]!, changed: false })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) was.push({ text: a[i++]!, changed: true })
    else now.push({ text: b[j++]!, changed: true })
  }
  while (i < n) was.push({ text: a[i++]!, changed: true })
  while (j < m) now.push({ text: b[j++]!, changed: true })
  return { was: joinParts(was), now: joinParts(now) }
}

/** Neighbouring parts of one kind as one, so a run of removed words is one mark. */
function joinParts(parts: DiffPart[]): DiffPart[] {
  // A space between two changed words belongs to the change.
  const marked = parts.map((p, i) =>
    !p.changed && /^\s+$/.test(p.text) && parts[i - 1]?.changed && parts[i + 1]?.changed ? { ...p, changed: true } : p,
  )
  const out: DiffPart[] = []
  for (const p of marked) {
    const last = out[out.length - 1]
    if (last && last.changed === p.changed) last.text += p.text
    else out.push({ ...p })
  }
  return out
}

/** How far a money amount moved, in percent of what it was; null when either is not an amount, or it was 0. */
export function priceMove(before: string | null, after: string | null): number | null {
  const was = before === null ? NaN : Number(before)
  const now = after === null ? NaN : Number(after)
  if (!Number.isFinite(was) || !Number.isFinite(now) || was === 0) return null
  return ((now - was) / was) * 100
}

/** The rise past which a shop price is worth a look: a guide for the reviewer, never a rule. */
export const PRICE_RISE_TO_LOOK_AT = 10

/** A size's shop price change in a change: `variant:<id>:shopPriceAmount`. */
export const isShopPriceChange = (field: string) => field.startsWith("variant:") && field.endsWith(":shopPriceAmount")

/** The shop prices a change raises past the guide, by the size's label. */
export function bigPriceRises(item: Pick<ReviewItemDetailDTO, "changes">): { label: string; move: number }[] {
  return item.changes.flatMap((c) => {
    if (!isShopPriceChange(c.field)) return []
    const move = priceMove(c.before, c.after)
    return move !== null && move > PRICE_RISE_TO_LOOK_AT ? [{ label: c.label.replace(/ - .*$/, ""), move }] : []
  })
}

export const signedPercent = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`

/** What a reviewer checks before deciding, each a click from its section; a required one that fails blocks approval. */
export function reviewChecks(
  item: Pick<
    ReviewItemDetailDTO,
    "images" | "missingRequired" | "missingRecommended" | "factOverrides" | "changes" | "marginRequired"
  >,
  marginSet: boolean,
): {
  key: string
  label: string
  ok: boolean
  required?: boolean
  attention?: boolean
  note?: string
  section?: string
}[] {
  const pictures = item.images.proposed ?? item.images.current
  const rises = bigPriceRises(item)
  const fact: Record<FactKey, string> = { storage: "Storage", gstStatus: "GST", ageRestricted: "18+" }
  return [
    {
      key: "picture",
      label: "A main picture",
      ok: pictures.length > 0,
      required: true,
      note: "None",
      section: "pictures",
    },
    {
      key: "required",
      label: "Required details filled",
      ok: item.missingRequired.length === 0,
      required: true,
      note: `${item.missingRequired.join(", ")} empty`,
      section: "details",
    },
    {
      key: "facts",
      label: "Facts match the category",
      ok: item.factOverrides.length === 0,
      attention: true,
      note: `${item.factOverrides.map((k) => fact[k]).join(", ")} changed by the shop`,
      section: "details",
    },
    {
      key: "prices",
      label: `Prices move under ${PRICE_RISE_TO_LOOK_AT}%`,
      ok: rises.length === 0,
      attention: true,
      note: rises.map((r) => `${r.label} ${signedPercent(r.move)}`).join(", "),
      section: "sizes",
    },
    {
      key: "recommended",
      label: "Recommended details",
      ok: item.missingRecommended.length === 0,
      attention: true,
      note: `${item.missingRecommended.length} left empty - never blocks`,
      section: "details",
    },
    {
      key: "margin",
      label: "A margin to approve at",
      ok: marginSet || !item.marginRequired,
      required: true,
      note: "Set one in Decision",
    },
  ]
}
