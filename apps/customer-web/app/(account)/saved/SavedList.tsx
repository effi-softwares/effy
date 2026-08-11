"use client"

import { useEffect, useState } from "react"

import type { SavedItemDTO, SavedVerdict } from "@effy/shared-types"

import { EmptyState } from "@/components/storefront/kit"
import { DEFAULT_PACKAGE_KEY } from "@/lib/cart-store"
import { addItem } from "@/lib/cart-actions"
import { formatMoney } from "@/lib/money"
import { refreshSaved, toggleSaved } from "@/lib/saved-actions"
import { takeMergeNotice } from "@/lib/saved-merge"
import { isPurchasable, verdictNote } from "@/lib/saved-display"

/**
 * The saved list (033) — a watchlist, so every row says what CHANGED.
 *
 * ⚠ A LIST, not a grid of cards. Principle V bars card-style containers for laying out content, and
 * this is account content — the address book presents the same way.
 */
export function SavedList({ initial }: { initial: SavedItemDTO[] }) {
  const [items, setItems] = useState(initial)

  // ⚠ The server render could not know the delivery location (it is device-local, deliberately not a
  // cookie), so it answered "not yet determined" for everything. Re-read with the postcode so the
  // shopper sees real verdicts. FR-039 also requires this to re-run when they change location.
  const [merged, setMerged] = useState(0)
  const [bulk, setBulk] = useState<{ added: number; skipped: { productId: string; reason: string }[] } | null>(null)
  const [busy, setBusy] = useState(false)
  // ⚠ CLIENT-SIDE (FR-056). The set is capped at 200 and already in memory, so a server round trip
  // per sort would be latency for nothing — and at ~135 ms to Sydney it would be latency the shopper
  // feels on every tap of a control that should feel instant.
  const [order, setOrder] = useState<"recent" | "available" | "aisle">("recent")

  useEffect(() => {
    void refreshSaved()
    // ⚠ FR-032: tell the shopper what joined from this device. Read-once — saying it twice would
    // imply it happened twice.
    setMerged(takeMergeNotice())
  }, [])

  /**
   * ⚠ NOTHING IS SILENTLY OMITTED (FR-052). The response names every item that did not go in, and it
   * is rendered — a bulk add that quietly drops what it could not take leaves the shopper believing
   * they bought something they did not.
   */
  async function addAll() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/saved/add-to-cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeId: crypto.randomUUID() }),
      })
      if (res.ok) setBulk(await res.json())
    } catch {
      /* transient — the cart is unchanged and the shopper can retry */
    } finally {
      setBusy(false)
    }
  }

  async function remove(productId: string) {
    setItems((prev) => prev.filter((i) => i.id !== productId))
    await toggleSaved(productId, false)
  }

  const shown = sortSaved(items, order)

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing saved yet"
        description="Tap the heart on anything you want to keep an eye on. We'll show you when the price drops or it comes back in stock. Saved before signing in? Those stay on this device until you sign in."
        action={{ label: "Start shopping", href: "/search" }}
      />
    )
  }

  // ⚠ A NOTICE, not a replacement for the list.
  //
  // ⚠ THIS USED TO REPLACE THE WHOLE LIST. When nothing could be delivered, the page rendered an
  // empty state instead of the items — hiding things the shopper had deliberately saved and making a
  // full list look like a lost one. That is FR-041's rule ("a withdrawn product must not silently
  // vanish") broken one level up, and it over-read FR-057: the spec asks for a distinct MESSAGE, not
  // for the list to be replaced by one. The per-item note already says which items cannot come.
  return (
    <>
      
      {merged > 0 && (
        <p role="status" className="mb-4 rounded-md border px-3 py-2 text-sm">
          {merged === 1
            ? "1 item you saved before signing in was added to your saved items."
            : `${merged} items you saved before signing in were added to your saved items.`}{" "}
          {/* ⚠ Individually removable, which is what makes an automatic join acceptable on a shared
              device: it is visible and reversible rather than confirmed-in-advance. */}
          You can remove anything you don't want below.
        </p>
      )}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <label htmlFor="saved-order" className="text-muted-foreground">
          Sort
        </label>
        <select
          id="saved-order"
          value={order}
          onChange={(e) => setOrder(e.target.value as typeof order)}
          className="rounded-md border bg-card px-2 py-1"
        >
          <option value="recent">Recently saved</option>
          <option value="available">Available first</option>
          <option value="aisle">By aisle</option>
        </select>
      </div>

      {items.some((i) => isPurchasable(i.verdict)) && (
        <div className="mb-4">
          <button
            type="button"
            onClick={addAll}
            disabled={busy}
            className="rounded-full border px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
          >
            Add everything available to cart
          </button>
        </div>
      )}

      {bulk && (
        <div role="status" className="mb-4 rounded-md border px-3 py-2 text-sm">
          <p>
            {bulk.added === 1 ? "1 item added to your cart." : `${bulk.added} items added to your cart.`}
          </p>
          {bulk.skipped.length > 0 && (
            <>
              <p className="mt-1">These weren't added:</p>
              <ul className="mt-1 list-disc pl-5">
                {bulk.skipped.map((s) => (
                  <li key={s.productId}>
                    {items.find((i) => i.id === s.productId)?.name ?? s.productId} —{" "}
                    {skipReason(s.reason)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ⚠ FR-027: a guest's saves are device-held, and saying so is the difference between a
          deliberate design and an apparent bug when they sign in on another phone. */}
      <ul className="divide-y">
      {shown.map((item) => (
        <li key={item.id} className="flex items-center gap-4 py-4">
          <div className="min-w-0 flex-1">
            <a href={`/product/${item.id}`} className="font-medium hover:underline">
              {item.name}
            </a>
            <p className="mt-1 text-sm">
              {formatMoney(item.priceAmount, item.currency)}
              {/* The watchlist's whole reason for existing: what changed since it was saved. */}
              {item.priceDropped && (
                <span className="ml-2 text-muted-foreground line-through">
                  {formatMoney(item.savedPriceAmount, item.currency)}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{verdictNote(item.verdict)}</p>
          </div>

          {isPurchasable(item.verdict) && (
            <button
              type="button"
              onClick={() =>
                addItem({
                  productId: item.id,
                  name: item.name,
                  imageUrl: item.imageUrl,
                  unitPriceAmount: item.priceAmount,
                  currency: item.currency,
                  quantity: 1,
                  packageKey: DEFAULT_PACKAGE_KEY,
                })
              }
              className="rounded-full border px-3 py-1 text-sm hover:bg-accent"
            >
              Add to cart
            </button>
          )}

          <button
            type="button"
            onClick={() => remove(item.id)}
            className="text-sm text-muted-foreground hover:underline"
          >
            Remove
          </button>
        </li>
      ))}
      </ul>
    </>
  )
}


/**
 * ⚠ A skip reason is either one of the five verdicts (so the bulk add and the list can never explain
 * the same item differently) or one of the cart's own refusals, which mean different things and must
 * not be flattened into "couldn't add".
 */
function skipReason(reason: string): string {
  switch (reason) {
    case "cart_full":
      return "your cart is full"
    case "not_found":
      return "no longer available"
    case "unavailable":
      return "couldn't be added right now"
    default:
      return verdictNote(reason as SavedVerdict).toLowerCase()
  }
}

/**
 * Order the saved list (FR-056).
 *
 * ⚠ `sort` is given a COPY. Array.prototype.sort mutates in place, and `items` is React state — sorting
 * it directly would mutate state outside a setter and make the next render's diff a lie.
 *
 * "By aisle" is grocery-native: a shopper walking a list thinks in categories, not in save order. Items
 * with no category sink to the end rather than forming a phantom group.
 */
function sortSaved(items: SavedItemDTO[], order: "recent" | "available" | "aisle"): SavedItemDTO[] {
  const copy = [...items]
  switch (order) {
    case "available":
      // Stable within each group, so "available first" still reads newest-first inside it.
      return copy.sort(
        (a, b) => Number(isPurchasable(b.verdict)) - Number(isPurchasable(a.verdict)),
      )
    case "aisle":
      return copy.sort((a, b) =>
        (a.categoryKey ?? "\uffff").localeCompare(b.categoryKey ?? "\uffff"),
      )
    case "recent":
    default:
      // The server already returns newest-first; this is the identity order and stays cheap.
      return copy
  }
}
