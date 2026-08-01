"use client"

import type { LocalityDTO } from "@effy/shared-types"

import { coreApiBaseUrl } from "@/lib/config"

/**
 * Find places a shopper could mean (030 FR-005). Typed from `LocalityDTO` in `@effy/shared-types`
 * rather than a local shape — Principle II, and the same type the Kotlin client is generated from.
 *
 * ⚠ THREE OUTCOMES, and they must stay distinguishable all the way to the shopper:
 *
 *   LocalityDTO[]  (possibly empty)  the lookup ran; an empty list means "no place matches"
 *   "invalid"                        too little input — the UI says "keep typing"
 *   "failed"                         we could not look it up
 *
 * None of them is "we don't deliver there". That is a different question, answered elsewhere, and
 * collapsing any of these into it is the failure the whole delivery-location capability exists to
 * prevent (FR-012, FR-013).
 *
 * ⚠ This module is only ever reached from `DeliveryPanel`, which is lazily loaded. Do not import it
 * from the always-loaded storefront chrome — see the note at the top of `DeliveryAffordance`.
 */
export type LocalityResult = { kind: "ok"; places: LocalityDTO[] } | { kind: "invalid" } | { kind: "failed" }

export async function searchLocalities(query: string, signal?: AbortSignal): Promise<LocalityResult> {
  try {
    const res = await fetch(
      `${coreApiBaseUrl()}/v1/storefront/localities?q=${encodeURIComponent(query)}`,
      { signal },
    )
    if (res.status === 400) return { kind: "invalid" }
    if (!res.ok) return { kind: "failed" }
    return { kind: "ok", places: (await res.json()) as LocalityDTO[] }
  } catch {
    // Aborted, offline, or blocked. ⚠ "failed", never an empty list — an empty list reads as
    // "that place doesn't exist", which is a false statement about the world caused by our outage.
    return { kind: "failed" }
  }
}
