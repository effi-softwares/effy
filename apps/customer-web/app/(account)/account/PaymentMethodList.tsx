"use client"

import { CreditCard, Trash2 } from "lucide-react"
import { useState } from "react"

import type { PaymentMethodDTO } from "@effy/shared-types"

import { NetworkMark, brandLabel } from "@/app/checkout/_payment/BrandMarks"
import { capture } from "@/lib/telemetry"
import { cn } from "@/lib/utils"

/**
 * The account's payment methods, so a card can be removed without starting a checkout. Three states:
 * cards, none, and "we could not ask" (`loadFailed`), which must not render as none.
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
      // Is success from the shopper's point of view: the card is gone either way.
      if (!res.ok && res.status !== 404) {
        setError("We couldn't remove that card. Your cards are unchanged - try again in a moment.")
        return
      }
      capture({ name: "card_removed", props: { from: "account" } })
      setCards((prev) => prev.filter((c) => c.id !== id))
    } catch {
      setError("We couldn't reach the server. Your cards are unchanged - try again in a moment.")
    } finally {
      setRemoving(null)
    }
  }

  if (loadFailed) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        We couldn&apos;t load your saved cards just now. This doesn&apos;t affect your saved cards -
        refresh the page to try again.
      </p>
    )
  }

  if (cards.length === 0) {
    // An honest empty state with no dead controls: cards are kept while paying, not added here.
    return (
      <p className="text-sm text-muted-foreground">
        You haven&apos;t saved any cards yet. When you pay, you can choose to save your card for next
        time - it will appear here.
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
              "flex h-16 items-center gap-3 rounded-xl border border-input px-4",
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
                // The reason is stated.
                <span className="text-xs text-destructive">
                  {card.unusableReason ?? "This card can't be used."}
                </span>
              )}
            </span>

            {card.isDefault && card.usable ? (
              <span className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium uppercase tracking-[0.04em] text-muted-foreground">
                Default
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => remove(card.id)}
              disabled={removing === card.id}
              // A 44px target around a 16px icon.
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              aria-label={`Remove card ending ${card.last4}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CreditCard className="size-4 shrink-0" aria-hidden="true" />
        Effy never sees or stores your card number - only the last four digits, so you can tell your
        cards apart.
      </p>
    </div>
  )
}
