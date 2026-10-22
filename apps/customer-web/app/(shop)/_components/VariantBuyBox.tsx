"use client"

import { CircleCheck, CircleX } from "lucide-react"
import { useState } from "react"

import type { OptionDTO, ProductOfferDTO, StorefrontVariantDTO } from "@effy/shared-types"

import { Badge } from "@/components/ui/badge"
import { formatMoney, isDiscounted } from "@/lib/money"
import { pickValue, selectorRows, variantById } from "@/lib/variant-selection"

import { AddToCartControl } from "./AddToCartControl"
import { AddToListButton } from "./AddToListButton"
import { SaveControl } from "./SaveControl"
import { UnitPrice } from "./UnitPrice"

/**
 * The product page's buy box (098): price, the size selector, availability and the add / save / list
 * controls — all following the ONE selected variant.
 *
 * ⚠ THE SELECTION IS ALWAYS ONE VARIANT. Picking a value moves to a variant that has it
 * (`lib/variant-selection.ts`), so price, "Available now" and the add button never describe a size
 * that does not exist. A sold-out size stays in the selector, marked in WORDS and struck through
 * (FR-015) — never by colour alone.
 *
 * ⚠ The URL follows the choice (`?variant=`) with `replaceState`, not a navigation: a shared link
 * opens on the same size, and choosing a size costs no request. The gallery is zero-JS (scroll-snap
 * anchors), so a size with its own picture scrolls the gallery to it.
 */
export function VariantBuyBox({
  product,
  options,
  variants,
  initialVariantId,
  offer,
  currency,
  gallery,
}: {
  product: { id: string; name: string; imageUrl: string | null; imageWidths?: number[] }
  options: OptionDTO[]
  variants: StorefrontVariantDTO[]
  initialVariantId: string
  offer: ProductOfferDTO | null | undefined
  currency: string
  /** The gallery's picture addresses, in slide order — to show a size's own picture. */
  gallery: string[]
}) {
  const [selectedId, setSelectedId] = useState(initialVariantId)
  const selected = variantById(variants, selectedId) ?? variants[0]
  if (!selected) return null

  function choose(next: StorefrontVariantDTO | undefined) {
    if (!next || next.id === selectedId) return
    setSelectedId(next.id)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("variant", next.id)
      window.history.replaceState(window.history.state, "", url)
    } catch {
      /* a URL that cannot be rewritten costs only the shareable link */
    }
    const slide = next.imageUrl ? gallery.indexOf(next.imageUrl) : -1
    if (slide >= 0) document.getElementById(`product-slide-${slide}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" })
    void import("@/lib/telemetry").then(({ capture }) =>
      capture({ name: "variant_selected", props: { productId: product.id, variantId: next.id } }),
    )
  }

  const discounted = isDiscounted(selected.priceAmount, selected.compareAtAmount)
  const saving = discounted && selected.compareAtAmount ? Number(selected.compareAtAmount) - Number(selected.priceAmount) : 0
  const percentOff = discounted && selected.compareAtAmount ? Math.round((saving / Number(selected.compareAtAmount)) * 100) : null
  const rows = options.length > 0 ? selectorRows(options, variants, selected) : []

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-3xl font-bold tabular-nums">{formatMoney(selected.priceAmount, currency)}</span>
        {/* 094 — the offer the cart will apply to this product (every size of it). */}
        {offer && selected.available ? <Badge variant="brand">{offer.label}</Badge> : null}
        {discounted && selected.compareAtAmount && (
          <>
            <span className="text-sm text-muted-foreground tabular-nums line-through">
              <span className="sr-only">was </span>
              {formatMoney(selected.compareAtAmount, currency)}
            </span>
            {percentOff !== null && percentOff > 0 && (
              <Badge variant="brand" className="self-center">
                −{percentOff}%
              </Badge>
            )}
          </>
        )}
      </div>
      <UnitPrice unit={selected.unitPrice} className="mt-1 block text-sm" />
      {saving > 0 && percentOff !== null && percentOff > 0 && (
        <p className="mt-1 text-sm font-medium text-brand">
          Save {formatMoney(saving.toFixed(2), currency)} ({percentOff}% off)
        </p>
      )}
      {/* ⚠ "Available" is all that is said — never a count. */}
      <p role="status" className={`mt-4 flex items-center gap-2 text-sm font-medium ${selected.available ? "text-brand" : ""}`}>
        {selected.available ? <CircleCheck aria-hidden="true" className="size-4" /> : <CircleX aria-hidden="true" className="size-4" />}
        {selected.available ? "Available now" : options.length > 0 ? "This size is sold out" : "Currently unavailable"}
      </p>

      {rows.map((row) => (
        <fieldset key={row.option.id} className="mt-5">
          <legend className="text-sm font-medium">
            {row.option.name}
            <span className="font-normal text-muted-foreground">
              {": "}
              {row.values.find((v) => v.selected)?.value ?? ""}
            </span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {row.values.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.selected}
                onClick={() => choose(pickValue(variants, selected.optionValueIds, row.slot, v.id))}
                className={`inline-flex h-10 min-w-12 items-center justify-center rounded-md border px-3 text-sm font-medium shadow-xs transition hover:bg-accent ${
                  v.selected ? "border-primary ring-1 ring-primary" : "border-input bg-background"
                } ${v.state === "sold_out" ? "text-muted-foreground line-through" : ""}`}
              >
                {v.value}
                {v.state === "sold_out" ? <span className="sr-only"> — sold out</span> : null}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="mt-6 border-t pt-6">
        <AddToCartControl
          key={selected.id}
          unavailableText={options.length > 0 ? "This size is sold out. Choose another, or save it for later." : undefined}
          product={{
            variantId: selected.id,
            productId: product.id,
            name: product.name,
            variantLabel: selected.label,
            unitPrice: selected.unitPrice,
            // The size's own picture when it has one, so the cart line shows what was chosen.
            imageUrl: selected.imageUrl ?? product.imageUrl,
            imageWidths: selected.imageUrl ? selected.imageWidths : product.imageWidths,
            unitPriceAmount: selected.priceAmount,
            currency,
            available: selected.available,
          }}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <SaveControl productId={product.id} variantId={selected.id} label />
          <AddToListButton productId={product.id} variantId={selected.id} />
        </div>
      </div>
    </>
  )
}
