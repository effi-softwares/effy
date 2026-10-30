import { unitPrice, unitPriceText } from "@effy/shared-types"
import { quantityOf, type PreviewSize, type QualityItem, type SizeView } from "@effy/web-kit/product-page"

import { formatMoney, orderedMedia } from "./detailFormat"
import type { ProductDetail } from "./model"
import { isApproved } from "./review"

/** The shop's sizes as the product page draws them. A price waiting for Effy is shown beside the live one. */
export function shopSizes(detail: ProductDetail): SizeView[] {
  const approved = isApproved(detail)
  const proposed = new Map((detail.pendingChange?.proposed.variants ?? []).map((v) => [v.id, v]))
  return detail.variants
    .filter((v) => v.state !== "removed")
    .map((v) => {
      const next = proposed.get(v.id)?.shopPriceAmount
      const quantity = quantityOf(v.packQuantity, v.packUnit)
      return {
        id: v.id,
        label: v.label ?? (quantity ? `${quantity.amount} ${quantity.unit}` : "One size"),
        code: v.code,
        sku: v.sku,
        gtin: v.gtin,
        quantity,
        weightGrams: v.weightGrams,
        weightAssumed: v.weightIsAssumed,
        shopPrice: v.shopPriceAmount,
        customerPrice: approved ? v.customerPriceAmount : null,
        pendingShopPrice: next !== undefined && Number(next) !== Number(v.shopPriceAmount) ? next : null,
        unitPrice: approved ? unitPrice(v.customerPriceAmount, v.packQuantity, v.packUnit, detail.unitBasis) : null,
        onSale: v.state === "active",
        stock: {
          tracked: v.stock.tracked,
          onHand: v.stock.onHand,
          alertAt: v.stock.effectiveThreshold,
          low: v.stock.low,
          out: v.stock.outOfStock,
        },
      }
    })
}

/** "AUD 9.50 – AUD 38.00" over the sizes on sale (every size when none is), or "—". */
export function priceRange(detail: ProductDetail, amount: (s: SizeView) => string | null): string {
  const sizes = shopSizes(detail)
  const pool = sizes.some((s) => s.onSale) ? sizes.filter((s) => s.onSale) : sizes
  const amounts = pool
    .map(amount)
    .filter((a): a is string => a !== null)
    .map(Number)
  if (amounts.length === 0) return "—"
  const lo = Math.min(...amounts).toFixed(2)
  const hi = Math.max(...amounts).toFixed(2)
  return lo === hi
    ? formatMoney(lo, detail.currency)
    : `${formatMoney(lo, detail.currency)} – ${formatMoney(hi, detail.currency)}`
}

/** What the listing has and lacks, in the order a shop would fix it. */
export function shopQuality(detail: ProductDetail): QualityItem[] {
  const sizes = shopSizes(detail)
  const pictures = orderedMedia(detail).length
  const noBarcode = sizes.filter((s) => !s.gtin).length
  const soldOut = sizes.filter((s) => s.onSale && s.stock.out)
  return [
    { key: "picture", label: "A main picture", ok: pictures > 0, required: true, note: "None", section: "pictures" },
    {
      key: "pictures",
      label: "Three or more pictures",
      ok: pictures >= 3,
      note: `${pictures} of 3`,
      section: "pictures",
    },
    {
      key: "details",
      label: "Required details",
      ok: detail.missingRequired.length === 0,
      required: true,
      note: `${detail.missingRequired.length} missing`,
      section: "details",
    },
    { key: "long", label: "A long description", ok: !!detail.longDescription?.trim(), note: "Empty", section: "about" },
    {
      key: "barcode",
      label: sizes.length > 1 ? "A barcode on every size" : "A barcode",
      ok: noBarcode === 0,
      note: sizes.length > 1 ? `${sizes.length - noBarcode} of ${sizes.length}` : "None",
      section: "sizes",
    },
    {
      key: "stock",
      label: sizes.length > 1 ? "Every size on sale in stock" : "In stock",
      ok: soldOut.length === 0,
      attention: true,
      note: soldOut.length > 1 ? `${soldOut.length} out` : sizes.length > 1 ? `${soldOut[0]?.label} out` : "Out",
      section: "sizes",
    },
  ]
}

const PRICE = /^\d+(\.\d{1,2})?$/

/**
 * The sizes on sale as the preview shows them, from the product as the shop is editing it: a size whose price is
 * changing (in the spreadsheet now, or with Effy) shows the shop's new price — what customers pay is Effy's to set on
 * approval — and the others what customers pay today.
 */
export function shopPreviewSizes(detail: ProductDetail, typed: Readonly<Record<string, string>> | null): PreviewSize[] {
  return shopSizes(detail)
    .filter((s) => s.onSale)
    .map((s) => {
      const next = typed?.[s.id] ?? s.pendingShopPrice
      const changing = next !== null && next !== undefined && Number(next) !== Number(s.shopPrice)
      if (changing || !s.customerPrice) {
        const yours = changing ? next!.trim() : s.shopPrice
        return {
          id: s.id,
          label: s.label,
          price: PRICE.test(yours) ? formatMoney(Number(yours).toFixed(2), detail.currency) : null,
          priceNote: "Your price — Effy sets what customers pay when it approves",
          unitPrice: null,
          soldOut: s.stock.out,
        }
      }
      return {
        id: s.id,
        label: s.label,
        price: formatMoney(s.customerPrice, detail.currency),
        unitPrice: s.unitPrice ? unitPriceText(s.unitPrice) : null,
        soldOut: s.stock.out,
      }
    })
}
