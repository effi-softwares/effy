"use client"

import { useEffect, useState } from "react"

import {
  DEFAULT_LIST_ID,
  type SavedAddToCartResultDTO,
  type SavedItemDTO,
  type SavedVerdict,
} from "@effy/shared-types"

import Link from "next/link"
import { CircleCheck, CircleX, Clock, Heart, ListPlus, Plus, ShoppingCart, Tag, Trash2 } from "lucide-react"

import { openListChooser } from "@/app/(shop)/_components/ListChooser"
import { EmptyState, MediaFrame, select } from "@/components/storefront/kit"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DEFAULT_PACKAGE_KEY, useCart } from "@/lib/cart-store"
import { addItem } from "@/lib/cart-actions"
import { addToList, fetchListItems, removeFromList } from "@/lib/list-actions"
import { formatMoney } from "@/lib/money"
import { refreshSaved } from "@/lib/saved-actions"
import { capture } from "@/lib/telemetry"
import { takeMergeNotice } from "@/lib/saved-merge"
import { isPurchasable, verdictNote } from "@/lib/saved-display"

import { UnitPrice } from "@/app/(shop)/_components/UnitPrice"

/**
 * A saved list, as a watchlist: every row says what changed. Renders any of the shopper's lists
 * (`listId` is `default` or a named list); every row action is scoped to this list.
 */
export function SavedList({ initial, listId = DEFAULT_LIST_ID }: { initial: SavedItemDTO[]; listId?: string }) {
  const [items, setItems] = useState(initial)
  const isDefault = listId === DEFAULT_LIST_ID
  const cart = useCart()
  // The most recent removal, so it can be undone into the place it held.
  const [removed, setRemoved] = useState<{ item: SavedItemDTO; index: number } | null>(null)

  // The server render cannot know the device-local delivery location, so verdicts are re-read with the postcode (and again when it changes).
  const [merged, setMerged] = useState(0)
  // `added` is the list of product ids that went in, not a count.
  const [bulk, setBulk] = useState<SavedAddToCartResultDTO | null>(null)
  const [busy, setBusy] = useState(false)
  // Sorted client-side: at most 200 items, already in memory.
  const [order, setOrder] = useState<"recent" | "available" | "aisle">("recent")

  useEffect(() => {
    void refreshSaved()
    // Tell the shopper what joined from this device, once.
    setMerged(takeMergeNotice())
  }, [])

  /** Nothing is silently omitted: every item that did not go in is named. */
  async function addAll() {
    if (busy) return
    setBusy(true)
    try {
      // This list only.
      const res = await fetch(`/api/lists/${encodeURIComponent(listId)}/add-to-cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeId: crypto.randomUUID() }),
      })
      if (res.ok) {
        const result = (await res.json()) as SavedAddToCartResultDTO
        setBulk(result)
        // Counts and the kind of list; never which list or its name.
        capture({
          name: "saved_list_add_all",
          props: {
            listKind: isDefault ? "default" : "named",
            addedCount: result.added.length,
            skippedCount: result.skipped.length,
          },
        })
      }
    } catch {
      /* transient: the cart is unchanged and the shopper can retry */
    } finally {
      setBusy(false)
    }
  }

  /** Removes from this list only (the shopper said which list they mean). */
  async function remove(item: SavedItemDTO) {
    const index = items.findIndex((i) => i.id === item.id)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setRemoved({ item, index })
    const result = await removeFromList(listId, item.id)
    if (!result.ok) {
      // It did not stick: put it back and withdraw the undo.
      setItems((prev) => insertAt(prev, item, index))
      setRemoved(null)
    }
  }

  /** Undo returns the product to the position it held, not the top. */
  async function undo() {
    if (!removed) return
    const { item, index } = removed
    setRemoved(null)
    setItems((prev) => insertAt(prev, item, index))
    const result = await addToList(listId, item.id, item.savedAt)
    if (!result.ok) setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  /** The chooser can take a product out of this list, so the rows are re-read when it closes. */
  function chooseLists(productId: string) {
    openListChooser(productId, () => {
      void fetchListItems(listId).then((result) => {
        if (result.ok) setItems(result.value)
      })
    })
  }

  // The most recent removal, offered back at the foot of the list.
  const undoNotice = removed && (
    <p role="status" className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-muted px-4 py-6 text-sm">
      <span>
        Removed {removed.item.name}
        {isDefault ? "." : " from this list."}
      </span>
      <button type="button" onClick={undo} className="font-medium text-primary underline underline-offset-4">
        Undo
      </button>
    </p>
  )

  const shown = sortSaved(items, order)

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        {undoNotice && <div className="overflow-hidden rounded-lg border">{undoNotice}</div>}
        {isDefault ? (
          <EmptyState
            icon={Heart}
            className="py-16"
            title="Nothing saved yet"
            description="Tap the heart on anything you want to keep an eye on. We'll show you when the price drops or it comes back in stock. Saved before signing in? Those stay on this device until you sign in."
            action={{ label: "Start shopping", href: "/search" }}
          />
        ) : (
          // Not "Nothing saved yet": that would tell a shopper with a full "Saved" list they had lost everything.
          <EmptyState
            icon={ListPlus}
            className="py-16"
            title="This list is empty"
            description="Open any product and choose Add to list to put it here."
            action={{ label: "Browse products", href: "/search" }}
          />
        )}
      </div>
    )
  }

  // A notice, not a replacement: the items still show, each with its note, so a withdrawn product never silently vanishes.
  return (
    <div className="space-y-6">
      {merged > 0 && isDefault && (
        <Alert
          variant="info"
          live
          title={
            merged === 1
              ? "1 item you saved before signing in was added to your saved items."
              : `${merged} items you saved before signing in were added to your saved items.`
          }
        >
          {/* Individually removable, which keeps an automatic join on a shared device visible and reversible. */}
          You can remove anything you don&apos;t want below.
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="saved-order" className="text-sm text-muted-foreground">
            Sort
          </label>
          <select
            id="saved-order"
            value={order}
            onChange={(e) => setOrder(e.target.value as typeof order)}
            className={cn(select, "w-45")}
          >
            <option value="recent">Recently saved</option>
            <option value="available">Available first</option>
            <option value="aisle">By aisle</option>
          </select>
        </div>
        {items.some((i) => isPurchasable(i.verdict)) && (
          <Button type="button" onClick={addAll} disabled={busy}>
            <ShoppingCart aria-hidden="true" />
            Add everything available to cart
          </Button>
        )}
      </div>

      {bulk && (
        <Alert
          variant="success"
          live
          title={
            bulk.added.length === 1 ? "1 item added to your cart." : `${bulk.added.length} items added to your cart.`
          }
        >
          {bulk.skipped.length > 0 && (
            <>
              These weren&apos;t added:{" "}
              {bulk.skipped
                .map((s) => `${items.find((i) => i.id === s.productId)?.name ?? s.productId} - ${skipReason(s.reason)}`)
                .join(" · ")}
              .
            </>
          )}
        </Alert>
      )}

      <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
        <ul className="divide-y">
          {shown.map((item) => {
            const available = isPurchasable(item.verdict)
            const quantity = inCart(cart, item.id)
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-4 p-4">
                <Link
                  href={`/product/${item.id}`}
                  aria-hidden="true"
                  tabIndex={-1}
                  className={cn("w-18 shrink-0", !available && "opacity-50")}
                >
                  <MediaFrame src={item.imageUrl} widths={item.imageWidths} alt="" sizes="72px" rounded="rounded-md" className="bg-secondary" />
                </Link>
                <div className="min-w-50 flex-1 space-y-1">
                  <Link href={savedHref(item)} className="font-medium hover:underline">
                    {item.name}
                    {/* The size remembered with the save. */}
                    {item.variantLabel ? <span className="font-normal text-muted-foreground"> · {item.variantLabel}</span> : null}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold tabular-nums">{formatMoney(item.priceAmount, item.currency)}</span>
                    {/* What changed since it was saved. */}
                    {item.priceDropped && (
                      <>
                        <span className="text-muted-foreground tabular-nums line-through">
                          {formatMoney(item.savedPriceAmount, item.currency)}
                        </span>
                        <Badge variant="brand-muted">
                          <Tag aria-hidden="true" />
                          Price dropped
                        </Badge>
                      </>
                    )}
                  </div>
                  <UnitPrice unit={item.unitPrice} className="block" />
                  <VerdictLine verdict={item.verdict} />
                </div>

                <div className="flex items-center gap-2">
                  {/* Adding to the cart keeps it in the list; a second "Add to cart" would raise the quantity, so say what is there. */}
                  {quantity > 0 ? (
                    <Button asChild variant="link" size="sm">
                      <Link href="/cart">{quantity === 1 ? "In your cart" : `${quantity} in your cart`}</Link>
                    </Button>
                  ) : available && item.variantId === null ? (
                    // Several sizes and none remembered: the shopper chooses.
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/product/${item.id}`}>Choose size</Link>
                    </Button>
                  ) : (
                    available &&
                    item.variantId !== null && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          addItem({
                            variantId: item.variantId!,
                            productId: item.id,
                            name: item.name,
                            variantLabel: item.variantLabel,
                            unitPrice: item.unitPrice,
                            imageUrl: item.imageUrl,
                            unitPriceAmount: item.priceAmount,
                            currency: item.currency,
                            quantity: 1,
                            packageKey: DEFAULT_PACKAGE_KEY,
                          })
                        }
                      >
                        <Plus aria-hidden="true" />
                        Add to cart
                      </Button>
                    )
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => chooseLists(item.id)}>
                    Add to list
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(item)}
                    aria-label={`Remove ${item.name}${isDefault ? "" : " from this list"}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
        {undoNotice && <div className="border-t">{undoNotice}</div>}
      </div>
    </div>
  )
}

/** Whether it can be bought now, said with a mark as well as a colour. */
function VerdictLine({ verdict }: { verdict: SavedVerdict }) {
  const Icon = verdict === "purchasable" ? CircleCheck : verdict === "no_longer_sold" ? CircleX : Clock
  return (
    <p className={cn("flex items-center gap-1 text-xs", verdict === "purchasable" ? "text-brand" : "text-muted-foreground")}>
      <Icon aria-hidden="true" className="size-3" />
      {verdictNote(verdict)}
    </p>
  )
}

function insertAt(items: SavedItemDTO[], item: SavedItemDTO, index: number): SavedItemDTO[] {
  if (items.some((i) => i.id === item.id)) return items
  const next = [...items]
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item)
  return next
}

/** The product page, on the remembered size. */
const savedHref = (item: SavedItemDTO) =>
  item.variantId && item.variantCount > 1 ? `/product/${item.id}?variant=${item.variantId}` : `/product/${item.id}`

function inCart(lines: readonly { productId: string; quantity: number }[], productId: string): number {
  return lines.reduce((n, l) => (l.productId === productId ? n + l.quantity : n), 0)
}

/** A skip reason is a verdict (so list and bulk add agree) or one of the cart's own refusals, never flattened. */
function skipReason(reason: string): string {
  switch (reason) {
    case "cart_full":
      return "your cart is full"
    case "not_found":
      return "no longer available"
    case "unavailable":
      return "couldn't be added right now"
    // Several sizes and none remembered: never a guessed size.
    case "choose_variant":
      return "choose a size on its page"
    default:
      return verdictNote(reason as SavedVerdict).toLowerCase()
  }
}

/**
 * Orders the saved list. `sort` gets a copy (`items` is React state). "By aisle" groups by category;
 * items with none sink to the end.
 */
function sortSaved(items: SavedItemDTO[], order: "recent" | "available" | "aisle"): SavedItemDTO[] {
  const copy = [...items]
  switch (order) {
    case "available":
      // Stable within each group, so "available first" stays newest-first inside it.
      return copy.sort(
        (a, b) => Number(isPurchasable(b.verdict)) - Number(isPurchasable(a.verdict)),
      )
    case "aisle":
      return copy.sort((a, b) =>
        (a.categoryKey ?? "\uffff").localeCompare(b.categoryKey ?? "\uffff"),
      )
    case "recent":
    default:
      // The server returns newest-first already.
      return copy
  }
}
