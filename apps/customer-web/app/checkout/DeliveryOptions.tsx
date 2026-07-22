"use client"

import { useMemo, useState } from "react"

import type {
  CheckoutDeliveryMethod,
  DeliveryMethodOptionDTO,
  DeliverySelectionDTO,
  QuotePackageDTO,
} from "@effy/shared-types"

import { formatCents, parseCents } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"

/**
 * The per-package delivery step (021 US1/US2/US3).
 *
 * Renders the quote as ANONYMOUS packages — a positional "Package N", the items it holds, and its
 * available methods (fee + window; a scheduled method adds a date picker). NEVER a shop name, code, or
 * location (SC-006), and NEVER who carries it (SC-007). The customer sets ONE order-level preference
 * (fastest / cheapest) applied to every package, and may OVERRIDE any single package; the running total
 * re-sums live. The client sends only the chosen METHOD (+ date) — never a fee; the server prices it
 * (SC-004).
 *
 * Undeliverable packages (serviceable:false) are auto-set-aside with an item-level notice and require an
 * explicit "proceed without these" confirmation before payment (US2 / FR-006b). When EVERY package is
 * undeliverable the customer is blocked entirely — there is nothing to proceed with (FR-006c).
 */

export type DeliveryPreference = "fastest" | "cheapest"

/** Fastest-first ordering of methods (same-day beats standard beats a picked date). */
const FASTEST_RANK: Record<CheckoutDeliveryMethod, number> = {
  same_day: 0,
  standard: 1,
  scheduled: 2,
}

/** The default method for a package under a preference — cheapest by fee, or fastest by service level. */
export function defaultMethodFor(
  pkg: QuotePackageDTO,
  preference: DeliveryPreference,
): DeliveryMethodOptionDTO | null {
  if (pkg.methods.length === 0) return null
  return pkg.methods.reduce((best, m) => {
    if (preference === "cheapest") {
      return parseCents(m.feeAmount) < parseCents(best.feeAmount) ? m : best
    }
    return FASTEST_RANK[m.method] < FASTEST_RANK[best.method] ? m : best
  })
}

type Override = { method: CheckoutDeliveryMethod; scheduledDate: string | null }

/** The effective option + date for a package, given the preference and any per-package override. */
function resolveSelection(
  pkg: QuotePackageDTO,
  preference: DeliveryPreference,
  override: Override | undefined,
): { option: DeliveryMethodOptionDTO | null; scheduledDate: string | null } {
  const fallback = defaultMethodFor(pkg, preference)
  const method = override?.method ?? fallback?.method
  const option = pkg.methods.find((m) => m.method === method) ?? fallback
  const scheduledDate =
    option?.method === "scheduled"
      ? (override?.scheduledDate ?? option.scheduleDates?.[0] ?? null)
      : null
  return { option, scheduledDate }
}

export function DeliveryOptions({
  packages,
  itemSubtotal,
  currency,
  busy,
  error,
  notice,
  onConfirm,
  onBack,
}: {
  packages: QuotePackageDTO[]
  itemSubtotal: string
  currency: string
  busy: boolean
  error?: string | null
  notice?: string | null
  onConfirm: (selections: DeliverySelectionDTO[], excludedPackageKeys: string[]) => void
  onBack: () => void
}) {
  const [preference, setPreference] = useState<DeliveryPreference>("fastest")
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [confirmedSetAside, setConfirmedSetAside] = useState(false)

  const serviceable = packages.filter((p) => p.serviceable && p.methods.length > 0)
  const unserviceable = packages.filter((p) => !p.serviceable || p.methods.length === 0)
  const showLabels = packages.length > 1

  // Live-resolve every serviceable package's effective selection from the preference + overrides.
  const resolved = useMemo(
    () => serviceable.map((pkg) => ({ pkg, ...resolveSelection(pkg, preference, overrides[pkg.packageKey]) })),
    [serviceable, preference, overrides],
  )

  const deliveryCents = resolved.reduce((c, r) => c + (r.option ? parseCents(r.option.feeAmount) : 0), 0)
  const grandCents = parseCents(itemSubtotal) + deliveryCents

  const allUndeliverable = serviceable.length === 0
  const needsConfirm = unserviceable.length > 0
  const canConfirm = !busy && !allUndeliverable && (!needsConfirm || confirmedSetAside)

  function selectMethod(packageKey: string, method: CheckoutDeliveryMethod) {
    setOverrides((prev) => ({ ...prev, [packageKey]: { method, scheduledDate: null } }))
  }
  function selectDate(packageKey: string, scheduledDate: string) {
    setOverrides((prev) => ({
      ...prev,
      [packageKey]: { method: "scheduled", scheduledDate },
    }))
  }

  function confirm() {
    const selections: DeliverySelectionDTO[] = resolved
      .filter((r) => r.option)
      .map((r) => ({
        packageKey: r.pkg.packageKey,
        method: r.option!.method,
        scheduledDate: r.scheduledDate,
      }))
    onConfirm(selections, unserviceable.map((p) => p.packageKey))
  }

  return (
    <div className="mt-6 space-y-6">
      {notice && (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      {!allUndeliverable && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Delivery preference</h2>
          <div className="flex gap-2" role="radiogroup" aria-label="Delivery preference">
            {(["fastest", "cheapest"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={preference === p}
                onClick={() => setPreference(p)}
                className={`h-9 rounded-md border px-4 text-sm font-medium capitalize ${
                  preference === p ? "border-primary bg-primary/10 text-foreground" : "hover:bg-accent"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Applied to every package. Override any one below.
          </p>
        </section>
      )}

      {resolved.map(({ pkg, option, scheduledDate }, i) => (
        <section key={pkg.packageKey} className="rounded-lg border p-4">
          {showLabels && <h3 className="mb-2 text-sm font-semibold">Package {i + 1}</h3>}
          <ItemList items={pkg.items} />

          <fieldset className="mt-3 space-y-2">
            <legend className="sr-only">Delivery method for this package</legend>
            {pkg.methods.map((m) => {
              const checked = option?.method === m.method
              return (
                <label
                  key={m.method}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
                >
                  <input
                    type="radio"
                    name={`method-${pkg.packageKey}`}
                    className="mt-1"
                    checked={checked}
                    onChange={() => selectMethod(pkg.packageKey, m.method)}
                  />
                  <span className="flex-1 text-sm">
                    <span className="flex justify-between gap-3">
                      <span className="font-medium">{m.serviceLevel}</span>
                      <span className="font-medium">{formatMoney(m.feeAmount, currency)}</span>
                    </span>
                    {m.window && <span className="text-muted-foreground">{m.window}</span>}
                    {checked && m.method === "scheduled" && m.scheduleDates && (
                      <select
                        aria-label="Delivery date"
                        value={scheduledDate ?? ""}
                        onChange={(e) => selectDate(pkg.packageKey, e.target.value)}
                        onClick={(e) => e.preventDefault()}
                        className="mt-2 block h-9 w-full rounded-md border px-2 text-sm"
                      >
                        {m.scheduleDates.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </label>
              )
            })}
          </fieldset>
        </section>
      ))}

      {unserviceable.length > 0 && (
        <section className="rounded-lg border border-destructive/40 p-4">
          <h3 className="text-sm font-semibold">We can’t deliver these items to this address</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {allUndeliverable
              ? "Nothing in your cart can be delivered here. Choose a different address to continue."
              : "These items will be set aside — they won’t be placed or charged. You can change your address to have them delivered."}
          </p>
          {unserviceable.map((pkg) => (
            <ItemList key={pkg.packageKey} items={pkg.items} className="mt-3" muted />
          ))}
          {!allUndeliverable && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmedSetAside}
                onChange={(e) => setConfirmedSetAside(e.target.checked)}
              />
              <span>Proceed without these items</span>
            </label>
          )}
        </section>
      )}

      {!allUndeliverable && (
        <dl className="space-y-1 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Items</dt>
            <dd>{formatMoney(itemSubtotal, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd>{formatMoney(formatCents(deliveryCents), currency)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatMoney(formatCents(grandCents), currency)}</dd>
          </div>
        </dl>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        {!allUndeliverable && (
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="ml-auto flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Continue to payment
          </button>
        )}
      </div>
    </div>
  )
}

/** The items in a package — names + quantities only. NEVER a shop. */
function ItemList({
  items,
  className,
  muted,
}: {
  items: QuotePackageDTO["items"]
  className?: string
  muted?: boolean
}) {
  return (
    <ul className={`${className ?? ""} text-sm ${muted ? "text-muted-foreground" : ""}`.trim()}>
      {items.map((it) => (
        <li key={it.productId}>
          {it.name}
          {it.quantity > 1 ? ` × ${it.quantity}` : ""}
        </li>
      ))}
    </ul>
  )
}
