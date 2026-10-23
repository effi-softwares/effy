"use client"

import { Coins } from "lucide-react"
import type { CheckoutPointsDTO } from "@effy/shared-types"

import { formatCents } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"

import { maxPointsFor } from "./points"

/**
 * "Use points" at checkout.
 *
 * Shown only when the quote says the customer has points — no dead control for everyone else.
 * The default is the most they can use; the field lets them use fewer. The split shown is
 * the one the order is settled at: the server re-decides it and refuses rather than changes it.
 */
export function PointsControl({
  points,
  totalCents,
  on,
  onToggle,
  chosen,
  onChosen,
  currency,
  disabled,
}: {
  points: CheckoutPointsDTO
  totalCents: number
  on: boolean
  onToggle: (on: boolean) => void
  /** null = "the most I can" */
  chosen: number | null
  onChosen: (n: number | null) => void
  currency: string
  disabled?: boolean
}) {
  const max = maxPointsFor(points, totalCents)
  const value = Math.min(chosen ?? max, max)
  const fmt = (cents: number) => formatMoney(formatCents(cents), currency)

  return (
    <section aria-labelledby="points-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="points-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Coins aria-hidden="true" className="size-5 text-primary" />
            Pay with Effy points
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You have {points.usable.toLocaleString("en-AU")} points (worth {fmt(points.usable * points.centsPerPoint)}).
          </p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <span className="sr-only">Use points</span>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={on}
            disabled={disabled || max === 0}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span
            aria-hidden="true"
            className="relative h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-primary peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-background after:shadow-xs after:transition-transform peer-checked:after:translate-x-4"
          />
        </label>
      </div>
      {on && max > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
          <label htmlFor="points-amount" className="font-medium">
            Points to use
          </label>
          <input
            id="points-amount"
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            step={1}
            value={value}
            disabled={disabled}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value))
              onChosen(Number.isFinite(n) ? Math.max(0, Math.min(n, max)) : null)
            }}
            className="h-10 w-32 rounded-md border border-input bg-background px-3 tabular-nums shadow-xs"
          />
          <span className="text-muted-foreground">of {max.toLocaleString("en-AU")} you can use on this order</span>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Points are a way of paying — your order total stays the same.
      </p>
    </section>
  )
}
