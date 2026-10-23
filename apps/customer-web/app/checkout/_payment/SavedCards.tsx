"use client"

import { Check, CreditCard, Trash2 } from "lucide-react"
import { useState } from "react"

import type { PaymentMethodDTO } from "@effy/shared-types"

import { cn } from "@/lib/utils"

import { NetworkMark, brandLabel } from "./BrandMarks"

/** The sentinel for "use a new card" — deliberately not a real id, so it can never collide with one. */
export const NEW_CARD = "new" as const

/**
 * The shopper's kept cards, drawn by Effy (`confirmCardPayment` takes a payment-method id, so the web
 * needs no provider customer session; mobile's embedded element draws its own). Rows selected by a
 * doubled border, not cards.
 */
export function SavedCards({
  cards,
  selectedId,
  onSelect,
  onRemove,
  busy,
}: {
  cards: PaymentMethodDTO[]
  selectedId: string
  onSelect: (id: string) => void
  onRemove: (id: string) => Promise<void>
  busy?: boolean
}) {
  const [removing, setRemoving] = useState<string | null>(null)

  if (cards.length === 0) return null

  return (
    <fieldset>
      <legend className="mb-2.5 block text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Your saved cards
      </legend>

      <div className="flex flex-col gap-2">
        {cards.map((card) => {
          const selected = card.id === selectedId
          return (
            <div
              key={card.id}
              className={cn(
                "flex h-14 items-center gap-3 rounded-[10px] border px-3.5 transition-shadow",
                selected ? "border-foreground shadow-[0_0_0_1px_var(--foreground)]" : "border-input",
                // An unusable card is dimmed and not selectable. Dimming alone would still let a
                // shopper choose a card that cannot work and find out from the bank.
                !card.usable && "opacity-60",
              )}
            >
              <input
                type="radio"
                name="saved-card"
                value={card.id}
                checked={selected}
                onChange={() => onSelect(card.id)}
                disabled={!card.usable || busy}
                className="size-5 shrink-0 accent-foreground"
                aria-describedby={card.unusableReason ? `${card.id}-reason` : undefined}
              />
              <NetworkMark label={brandLabel(card.brand)} />
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium tracking-[0.02em]">•••• {card.last4}</span>
                {card.usable ? (
                  <span className="text-xs text-muted-foreground">
                    Expires {String(card.expMonth).padStart(2, "0")} / {String(card.expYear).slice(-2)}
                  </span>
                ) : (
                  // The reason is stated, never left for the shopper to work out. A card that is
                  // simply greyed out with no explanation reads as a bug in the page.
                  <span id={`${card.id}-reason`} className="text-xs font-medium text-foreground">
                    {card.unusableReason ?? "This card can't be used."}
                  </span>
                )}
              </span>

              {card.isDefault && card.usable ? (
                <span className="shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-foreground">
                  Default
                </span>
              ) : null}

              <button
                type="button"
                onClick={async () => {
                  setRemoving(card.id)
                  try {
                    await onRemove(card.id)
                  } finally {
                    setRemoving(null)
                  }
                }}
                disabled={busy || removing === card.id}
                // 44px minimum touch target — the icon is 16px, the hit area is not.
                className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                aria-label={`Remove card ending ${card.last4}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          )
        })}

        <label
          className={cn(
            "flex h-14 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 transition-shadow",
            selectedId === NEW_CARD
              ? "border-foreground shadow-[0_0_0_1px_var(--foreground)]"
              : "border-input",
          )}
        >
          <input
            type="radio"
            name="saved-card"
            value={NEW_CARD}
            checked={selectedId === NEW_CARD}
            onChange={() => onSelect(NEW_CARD)}
            disabled={busy}
            className="size-5 shrink-0 accent-foreground"
          />
          <span className="flex size-[34px] shrink-0 items-center justify-center text-muted-foreground">
            <CreditCard className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium">Use a new card</span>
        </label>
      </div>
    </fieldset>
  )
}

/**
 * The save-this-card consent control.
 *
 * This checkbox is the only thing that decides whether a card is kept. The server deliberately does
 * not set `setup_future_usage` on the intent — doing so would keep a card the shopper declined, and it
 * is a documented integration error besides. Spike S2 moved enforcement from the
 * provider's own checkbox to this one, which is exactly why the "declined card is absent later" test
 * exists rather than being assumed.
 */
export function SaveCardConsent({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="size-[18px] rounded-[5px] accent-foreground"
      />
      <span className="text-[13px]">Save this card for next time</span>
    </label>
  )
}

/** A tick used to mark a completed field. Kept here so the payment step imports one place. */
export function CompleteMark() {
  return <Check className="size-3.5 text-brand" aria-hidden="true" />
}
