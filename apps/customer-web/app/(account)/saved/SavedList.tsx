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

/**
 * The saved list (033) — a watchlist, so every row says what CHANGED.
 *
 * ⚠ A LIST, not a grid of cards. Principle V bars card-style containers for laying out content, and
 * this is account content — the address book presents the same way.
 *
 * ⚠ 068: THIS RENDERS ANY ONE OF THE SHOPPER'S LISTS. `listId` is `default` for "Saved" or a named
 * list's id. Everything a row does — add to cart, remove, add-all — is scoped to THIS list; a product
 * removed here stays in every other list it is in.
 */
export function SavedList({ initial, listId = DEFAULT_LIST_ID }: { initial: SavedItemDTO[]; listId?: string }) {
  const [items, setItems] = useState(initial)
  const isDefault = listId === DEFAULT_LIST_ID
  const cart = useCart()
  // The one most recent removal, so it can be undone back into the place it held (FR-024).
  const [removed, setRemoved] = useState<{ item: SavedItemDTO; index: number } | null>(null)

  // ⚠ The server render could not know the delivery location (it is device-local, deliberately not a
  // cookie), so it answered "not yet determined" for everything. Re-read with the postcode so the
  // shopper sees real verdicts. FR-039 also requires this to re-run when they change location.
  const [merged, setMerged] = useState(0)
  // ⚠ `added` is the LIST OF PRODUCT IDS that went in, not a count (`SavedAddToCartResultDTO`). This
  // was typed `number` and rendered directly, so the shopper was told "9f2c…,1a7b… items added to
  // your cart" — a row of ids where a number belonged. 068's test for the per-list add-all found it.
  const [bulk, setBulk] = useState<SavedAddToCartResultDTO | null>(null)
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
      // ⚠ THIS list only (068 FR-028). Nothing from another list goes in.
      const res = await fetch(`/api/lists/${encodeURIComponent(listId)}/add-to-cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeId: crypto.randomUUID() }),
      })
      if (res.ok) {
        const result = (await res.json()) as SavedAddToCartResultDTO
        setBulk(result)
        // Counts and the kind of list. Never which list, and never its name (FR-040).
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
      /* transient — the cart is unchanged and the shopper can retry */
    } finally {
      setBusy(false)
    }
  }

  /**
   * ⚠ REMOVES FROM THIS LIST ONLY (068 FR-024). It used to be the heart's un-save, which since 068
   * is refused for a product in a named list — and from a list's own page the shopper has said
   * exactly which list they mean, so there is nothing to refuse.
   */
  async function remove(item: SavedItemDTO) {
    const index = items.findIndex((i) => i.id === item.id)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    setRemoved({ item, index })
    const result = await removeFromList(listId, item.id)
    if (!result.ok) {
      // It did not stick: put it back and withdraw the offer to undo something that never happened.
      setItems((prev) => insertAt(prev, item, index))
      setRemoved(null)
    }
  }

  /** Undo returns the product to the position it held, not the top (033 FR-018, per list). */
  async function undo() {
    if (!removed) return
    const { item, index } = removed
    setRemoved(null)
    setItems((prev) => insertAt(prev, item, index))
    const result = await addToList(listId, item.id, item.savedAt)
    if (!result.ok) setItems((prev) => prev.filter((i) => i.id !== item.id))
  }

  /** The chooser can take a product out of this very list, so the rows are re-read when it closes. */
  function chooseLists(productId: string) {
    openListChooser(productId, () => {
      void fetchListItems(listId).then((result) => {
        if (result.ok) setItems(result.value)
      })
    })
  }

  // The one most recent removal, offered back at the foot of the list it left.
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
          // ⚠ A DIFFERENT message from the one above (068 FR-026). "Nothing saved yet" on an empty
          // named list would tell a shopper with a full "Saved" list that they had lost everything.
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

  // ⚠ A NOTICE, not a replacement for the list. When nothing can be delivered the items still show,
  // each with its own note: a withdrawn product must not silently vanish (FR-041), and a full list
  // must never look like a lost one.
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
          {/* ⚠ Individually removable, which is what makes an automatic join acceptable on a shared
              device: it is visible and reversible rather than confirmed-in-advance. */}
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
            className={cn(select, "w-[180px]")}
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
                .map((s) => `${items.find((i) => i.id === s.productId)?.name ?? s.productId} — ${skipReason(s.reason)}`)
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
                  className={cn("w-[72px] shrink-0", !available && "opacity-50")}
                >
                  <MediaFrame src={item.imageUrl} alt="" sizes="72px" rounded="rounded-md" className="bg-secondary" />
                </Link>
                <div className="min-w-[200px] flex-1 space-y-1">
                  <Link href={`/product/${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold tabular-nums">{formatMoney(item.priceAmount, item.currency)}</span>
                    {/* The watchlist's whole reason for existing: what changed since it was saved. */}
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
                  <VerdictLine verdict={item.verdict} />
                </div>

                <div className="flex items-center gap-2">
                  {/* 033 FR-050a: adding to the cart keeps the product in the list, so a row that went
                      on saying "Add to cart" would invite a second tap that is NOT a no-op — it raises
                      the quantity. Say what is already there, and how many. */}
                  {quantity > 0 ? (
                    <Button asChild variant="link" size="sm">
                      <Link href="/cart">{quantity === 1 ? "In your cart" : `${quantity} in your cart`}</Link>
                    </Button>
                  ) : (
                    available && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
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

/** Whether it can be bought right now — said with a mark as well as a colour. */
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

function inCart(lines: readonly { productId: string; quantity: number }[], productId: string): number {
  return lines.reduce((n, l) => (l.productId === productId ? n + l.quantity : n), 0)
}

/**
 * ⚠ A skip reason is either one of the verdicts (so the bulk add and the list can never explain
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
