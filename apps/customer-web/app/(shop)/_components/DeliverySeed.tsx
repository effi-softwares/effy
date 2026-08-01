import type { AddressDTO } from "@effy/shared-types"

import { edgeApi } from "@/lib/api/edge"
import { readServerSession } from "@/lib/session"

import { DeliveryAffordance } from "./DeliveryAffordance"

/**
 * Seeds the delivery location from the signed-in shopper's default address (030 US2 / FR-018).
 *
 * ── Why this exists at all ─────────────────────────────────────────────────────────────────────
 *
 * 025's FR-013 requires the storefront to "reuse a signed-in shopper's existing default address
 * where one exists". `seedFromAccount` was written for it on both surfaces and **called by neither**
 * — so a shopper who has already told Effy where they live was still being asked to type a postcode.
 * This is where that finally gets wired, three features late.
 *
 * ── ⚠ Why a PROP and not a `DeliverySeedClient` module (030 T027b) ─────────────────────────────
 *
 * The original design was a tiny client component rendering no markup, calling `seedFromAccount` on
 * mount. It does not survive contact with the byte budget: it must run on mount to be useful, so it
 * is ALWAYS-LOADED, and a new client-component boundary costs more than the ~0.1 KB of headroom the
 * storefront chrome has left. A prop on a component that already ships costs approximately nothing.
 *
 * ⚠ This is a SERVER component and must stay one. It reads cookies, so Next defers only this subtree
 * to request time — which is exactly why the (shop) layout wraps it in <Suspense> and why the layout
 * itself must never read cookies directly. See the warning at the top of `UserIsland`.
 *
 * ⚠ A GUEST costs nothing: no session means no address read, no fetch, no work (US2 scenario 8).
 *
 * ⚠ It READS the address book. It never writes to it — a delivery location is a device preference and
 * becomes an address only through the address book itself (FR-021).
 */
export async function DeliverySeed({ className }: { className?: string }) {
  // ⚠ `readServerSession`, NOT `lib/dal`'s `getSession`. The latter imports `aws-amplify`, which is
  // barred from the public path and machine-guarded — `pnpm depcruise` catches it, and did catch it
  // when this was first written. This decodes the cookie instead and forwards the token to a backend
  // that actually verifies it.
  const session = await readServerSession()
  if (!session?.idToken) return <DeliveryAffordance className={className} />

  let seed: { postcode: string; locality?: string | null; state?: string | null } | undefined
  try {
    // Cold path — account data (011's routing law). Per-customer, so never cached.
    const addresses = await edgeApi(session).get<AddressDTO[]>("/customer/v1/addresses", {
      cache: "no-store",
    })
    const preferred = addresses.find((a) => a.isDefault) ?? addresses[0]
    if (preferred?.postalCode) {
      seed = {
        postcode: preferred.postalCode,
        // `city` is the suburb on this model; `region` is the state and is NULLABLE on existing
        // addresses, so the display falls back to the bare postcode rather than inventing one.
        locality: preferred.city || null,
        state: preferred.region || null,
      }
    }
  } catch {
    // ⚠ A failed address read must not degrade the storefront. The shopper simply gets the ordinary
    // "Set location" affordance — the same thing a guest sees — rather than an error in the chrome.
  }

  return <DeliveryAffordance className={className} seed={seed} />
}

/** The shell shown while the island streams in — identical box, so nothing shifts. */
export function DeliverySeedFallback({ className }: { className?: string }) {
  return <DeliveryAffordance className={className} />
}
