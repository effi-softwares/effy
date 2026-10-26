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
  if (prices.length === 0) return "—"
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
