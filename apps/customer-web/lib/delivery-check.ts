"use client"

import { coreApiBaseUrl } from "@/lib/config"
import { recordServiceability } from "@/lib/delivery-store"

/**
 * Ask the platform whether Effy delivers to a postcode, and fold the answer into the store.
 *
 * Extracted from `DeliveryAffordance` by 030 because TWO places now need it: the affordance itself
 * (which re-checks a restored location on mount) and the lazily-loaded panel (which checks after the
 * shopper picks a place). Duplicating it would have put two copies of the "never degrade a failure
 * into a refusal" rule in the codebase, and the second one would eventually be written without it.
 *
 * ⚠ A FAILED CHECK LEAVES `serviced` NULL — which renders as "we couldn't check", never as "we don't
 * deliver here". Telling a prospective customer Effy refuses to serve them because a fetch failed is
 * the one outcome this whole capability exists to avoid (025 FR-014, 030 FR-013).
 */
export async function checkServiceability(postcode: string): Promise<void> {
  try {
    const res = await fetch(
      `${coreApiBaseUrl()}/v1/storefront/serviceability?postcode=${encodeURIComponent(postcode)}`,
    )
    if (!res.ok) return // 4xx/5xx → leave `serviced` null; the UI says "we couldn't check"
    const data: { postcode: string; serviced: boolean } = await res.json()
    recordServiceability(data.postcode, data.serviced)

    // ⚠ NEVER attach the postcode — or, since 030, the locality name or state — to telemetry. All
    // three are location data about an individual, and a suburb name is MORE identifying than a
    // postcode, not less. Principle VII allows no PII beyond the auth subject id; the boolean answers
    // the product question ("what share of visitors are outside a serviced zone?") without
    // identifying anyone (030 FR-047).
    //
    // ⚠ DYNAMIC import, deliberately. A static one pulls the telemetry module into the always-loaded
    // storefront chrome, which is on every public route against 0.2 KB of headroom. Same fix 027
    // applied to the cart's promo events.
    const { capture } = await import("@/lib/telemetry")
    capture({ name: "delivery_location_set", props: { serviced: data.serviced } })
  } catch {
    // Offline or blocked — `serviced` stays null. See the warning above.
  }
}
