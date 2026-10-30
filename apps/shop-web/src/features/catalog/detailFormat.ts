import type { ProductDetail, ProductMedia } from "./model"

export function formatMoney(amount: string | null, currency: string): string {
  if (!amount) return "-"
  return `${currency} ${amount}`
}

export function orderedMedia(detail: ProductDetail): ProductMedia[] {
  return [...detail.media].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    return a.displayOrder - b.displayOrder
  })
}

export function primaryMedia(detail: ProductDetail): ProductMedia | null {
  return detail.media.find((m) => m.isPrimary) ?? null
}

export function discountText(price: string | null, compareAt: string | null): string {
  const now = price == null ? NaN : Number(price)
  const was = compareAt == null ? NaN : Number(compareAt)
  if (!Number.isFinite(now) || !Number.isFinite(was) || was <= 0 || was <= now) return "-"
  return `${Math.round(((was - now) / was) * 100)}% off`
}

export function storefrontText(status: ProductDetail["status"]): string {
  switch (status) {
    case "active":
      return "On sale"
    case "unavailable":
      return "Unpublished - hidden from shoppers"
    case "draft":
      return "Draft - never published"
    case "archived":
      return "Archived - out of the working catalog"
    default:
      return status
  }
}
