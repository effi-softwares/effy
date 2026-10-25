import type { MarginDTO, ReviewKind } from "@effy/shared-types"

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
