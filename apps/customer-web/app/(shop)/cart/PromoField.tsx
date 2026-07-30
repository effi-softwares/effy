"use client"

import { useState } from "react"

import type { CartDiscountDTO } from "@effy/shared-types"

import { applyPromo, removePromo } from "@/lib/cart-actions"

/**
 * The promotional-code field (027 FR-041/FR-043).
 *
 * ⚠ The refusal it shows is the PLATFORM's, verbatim and specific — "expired", "already used", "below the
 * minimum" each call for a different response from the shopper, and a single "that code doesn't work"
 * would leave them guessing which. Nothing here judges a code (FR-042); it only carries the answer.
 *
 * ⚠ Rendered only for a signed-in shopper. A per-shopper cap cannot be enforced without an identity, so a
 * guest is shown why rather than a field that would take a code and then withdraw the discount.
 */
export function PromoField({ applied }: { applied: CartDiscountDTO | null }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <span className="text-sm font-medium">
          {applied.code} applied — {applied.label}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await removePromo()
            setBusy(false)
          }}
          className="text-sm text-muted-foreground hover:underline"
        >
          Remove
        </button>
      </div>
    )
  }

  async function apply(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    // ⚠ Read the result into a local first. Checking the `error` STATE here would read the previous
    // render's value, so a successful apply would keep the code in the box and a failed one would clear it.
    const attempted = code.trim()
    const refusal = await applyPromo(attempted)
    setError(refusal)
    // ⚠ The REFUSAL is the event worth having. A code that works is a campaign performing; a code that
    // is refused is a shopper stopped, and only the distribution of reasons says which stop the
    // platform keeps inflicting (FR-043).
    // ⚠ Imported DYNAMICALLY, and the reason is measured, not stylistic: a static
    // `import { capture } from "@/lib/telemetry"` here costs **+1.0 KB on four guest routes** and puts
    // `/search` and `/cart` OVER the 174 KB budget — one client component reaching telemetry re-shapes
    // Turbopack's shared chunks for the whole storefront. Applying a code is a rare, signed-in-only
    // action, so paying for the module at that moment costs a guest nothing. `lib/telemetry` holds
    // module-level state, and a dynamic import of the same module is the same instance — so this is the
    // SAME PostHog client the rest of the app uses, not a second one.
    void import("@/lib/telemetry").then(({ capture }) =>
      capture(
        refusal === null
          ? { name: "promo_code_applied", props: { code: attempted.toUpperCase() } }
          : { name: "promo_code_refused", props: { reason: refusal } },
      ),
    )
    if (refusal === null) setCode("")
    setBusy(false)
  }

  return (
    <form onSubmit={apply} className="border-t pt-4">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setError(null)
          }}
          placeholder="Promotional code"
          aria-label="Promotional code"
          aria-invalid={error ? true : undefined}
          className="h-10 flex-1 rounded-full border px-4 text-sm"
        />
        <button
          type="submit"
          disabled={busy || code.trim() === ""}
          className="h-10 rounded-full px-4 text-sm font-medium hover:bg-accent disabled:text-muted-foreground"
        >
          Apply
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
