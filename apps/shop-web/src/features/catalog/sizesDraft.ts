import { useEffect, useMemo, useState } from "react"

import { toast } from "@effy/design-system/ui"
import { draftFromDetail, toInputs, variantSetErrors } from "@effy/web-kit/product-form"
import type { SheetField, SheetRow } from "@effy/web-kit/product-page"

import { track } from "@/lib/telemetry"

import type { ProductDetail } from "./model"
import { isApproved } from "./review"
import { useFocusedEdit } from "./useFocusedEdit"

const FIELD_OF: Record<string, SheetField> = {
  shopPriceAmount: "price",
  sku: "sku",
  gtin: "gtin",
  weightGrams: "weight",
}

/**
 * What the shop is typing into its sizes — a price, its own code, a barcode, a packed weight — in either view (one
 * size in place, or the spreadsheet), held once so switching views keeps it. It starts from the product as the shop
 * is editing it (the live sizes, or the change already with Effy) and is saved as one change, through the same request
 * the sizes dialog sends.
 */
export function useSizesDraft(detail: ProductDetail, onDraft?: (prices: Record<string, string> | null) => void) {
  const edit = useFocusedEdit(detail.id)
  const approved = isApproved(detail)
  // Re-read on a new version only: a live re-read of the same product keeps what is being typed.
  const base = useMemo(() => draftFromDetail(detail), [detail.updatedAt])
  const initial = useMemo(
    () =>
      Object.fromEntries(
        base.variants.map((r) => [r.id, { price: r.shopPriceAmount, sku: r.sku, gtin: r.gtin, weight: r.weightGrams }]),
      ) as Record<string, SheetRow>,
    [base],
  )
  const [typed, setTyped] = useState<Record<string, SheetRow>>(initial)
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    setTyped(initial)
    setTouched(false)
  }, [initial])

  const set = {
    ...base,
    variants: base.variants.map((r) => {
      const t = typed[r.id]
      return t ? { ...r, shopPriceAmount: t.price, sku: t.sku, gtin: t.gtin, weightGrams: t.weight } : r
    }),
  }
  const errors: Record<string, string> = {}
  for (const [field, message] of Object.entries(variantSetErrors(set))) {
    const m = /^variants\[(\d+)\]\.(\w+)$/.exec(field)
    const row = m ? set.variants[Number(m[1])] : undefined
    const cell = m ? FIELD_OF[m[2]!] : undefined
    if (row && cell) errors[`${row.id}:${cell}`] = message
  }
  const changed = Object.keys(typed).filter((id) => JSON.stringify(typed[id]) !== JSON.stringify(initial[id]))
  const dirty = changed.length > 0
  const invalid = Object.keys(errors).length > 0

  useEffect(() => {
    onDraft?.(dirty ? Object.fromEntries(Object.entries(typed).map(([id, r]) => [id, r.price])) : null)
  }, [typed, dirty, onDraft])
  useEffect(() => () => onDraft?.(null), [onDraft])

  function change(sizeId: string, field: SheetField, value: string) {
    setTyped((t) => ({ ...t, [sizeId]: { ...t[sizeId]!, [field]: value } }))
  }

  function discard() {
    setTyped(initial)
    setTouched(false)
  }

  function save(onDone?: () => void) {
    setTouched(true)
    if (invalid) return
    const inputs = toInputs(set)
    void edit.save(
      {
        expectedUpdatedAt: detail.updatedAt,
        options: inputs.options,
        variants: inputs.variants,
        unitBasis: inputs.unitBasis,
      },
      () => {
        track({ name: "product_variants_saved", productId: detail.id, variantCount: inputs.variants.length })
        toast(approved ? "Sent to Effy. Customers see it once it is approved." : "Saved")
        onDone?.()
      },
    )
  }

  return {
    typed,
    initial,
    change,
    discard,
    save,
    changed: changed.length,
    dirty,
    /** Refusals, by `sizeId:field` — shown once a save has been tried. */
    errors: touched ? errors : undefined,
    invalid: touched && invalid,
    approved,
    saveLabel: approved ? "Send to Effy" : "Save",
    note: approved
      ? "Effy checks it first — customers keep seeing today's version until it is approved."
      : "Saved straight to the product.",
    saving: edit.saving,
    error: edit.error,
    stale: edit.stale,
    reload: edit.reload,
  }
}

export type SizesDraft = ReturnType<typeof useSizesDraft>
