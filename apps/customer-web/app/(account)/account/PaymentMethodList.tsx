"use client"

import { CreditCard, Trash2 } from "lucide-react"
import { useState } from "react"

import type { PaymentMethodDTO } from "@effy/shared-types"

import { NetworkMark, brandLabel } from "@/app/checkout/_payment/BrandMarks"
import { capture } from "@/lib/telemetry"
import { cn } from "@/lib/utils"

/**
 * The account's payment methods (051 US6).
 *
 * ⚠ WHY THIS EXISTS AT ALL. Removal was already reachable at the payment step, but that means a
 * shopper who wants to remove a card has to START A CHECKOUT to do it — and card removal is a trust
 * action people take precisely when they are NOT shopping. The address book set the expectation; this
 * is its sibling (Clarification Q1, FR-024a).
 *
 * ⚠ THREE STATES, NOT TWO. "You have no cards" and "we could not ask" are different facts, and a list
 * that renders empty on a failed read tells the shopper something false about their own account
 * (FR-036). `loadFailed` is what keeps them apart.
 */
export function PaymentMethodList({
  initial,
  loadFailed = false,
}: {
  initial: PaymentMethodDTO[]
  loadFailed?: boolean
}) {
  const [cards, setCards] = useState(initial)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(id: string) {
    setRemoving(id)
    setError(null)
    try {
      const res = await fetch(`/api/payment-methods/${id}`, { method: "DELETE" })
      // 404 is success from the shopper's point of view: the card is gone either way.
      if (!res.ok && res.status !== 404) {
        setError("We couldn't remove that card. Your cards are unchanged — try again in a moment.")
        return
      }
      capture({ name: "card_removed", props: { from: "account" } })
      setCards((prev) => prev.filter((c) => c.id !== id))
    } catch {
      setError("We couldn't reach the server. Your cards are unchanged — try again in a moment.")
    } finally {
      setRemoving(null)
    }
  }

  if (loadFailed) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        We couldn&apos;t load your saved cards just now. This doesn&apos;t affect your saved cards —
        refresh the page to try again.
      </p>
    )
  }

  if (cards.length === 0) {
    // ⚠ An honest empty state with NO dead controls. There is nothing to press here, because a card is
    // kept while paying and cannot be added from this screen (US6 scenario 4).
    return (
      <p className="text-sm text-muted-foreground">
        You haven&apos;t saved any cards yet. When you pay, you can choose to save your card for next
        time — it will appear here.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {cards.map((card) => (
          <li
            key={card.id}
            className={cn(
              "flex h-16 items-center gap-3 rounded-[10px] border border-input px-4",
              !card.usable && "opacity-60",
            )}
          >
            <NetworkMark label={brandLabel(card.brand)} />
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium tracking-[0.02em]">•••• {card.last4}</span>
              {card.usable ? (
                <span className="text-xs text-muted-foreground">
                  Expires {String(card.expMonth).padStart(2, "0")} / {String(card.expYear).slice(-2)}
                </span>
              ) : (
                // ⚠ The reason is stated, never left for the shopper to work out (FR-023).
                <span className="text-xs text-destructive">
                  {card.unusableReason ?? "This card can't be used."}
                </span>
              )}
            </span>

            {card.isDefault && card.usable ? (
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                Default
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => remove(card.id)}
              disabled={removing === card.id}
              // 44px minimum touch target (FR-033) — the icon is 16px, the hit area is not.
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              aria-label={`Remove card ending ${card.last4}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CreditCard className="size-3.5 shrink-0" aria-hidden="true" />
        Effy never sees or stores your card number — only the last four digits, so you can tell your
        cards apart.
      </p>
    </div>
  )
}
