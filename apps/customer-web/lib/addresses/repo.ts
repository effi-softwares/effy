"use client"

import type { AddressDTO, CreateAddressRequest, UpdateAddressRequest } from "@effy/shared-types"

/**
 * Client-side address-book mutation fetchers (022).
 *
 * ⚠ NO TanStack Query on this surface. customer-web is the deliberately dependency-free storefront —
 * the address book follows the FavoritesList pattern: the page fetches the initial list server-side,
 * and the client list holds it in `useState` and calls these fetchers, which hit the authenticated
 * Next proxy routes under `app/api/addresses/` (the proxy relays the session token to core-api).
 *
 * Every fetcher returns a discriminated result so the caller can distinguish success from a mapped
 * problem — crucially the **409** the delete-default guard raises (FR-016a), which the UI turns into
 * the "set another default first" prompt.
 */

export type SaveResult =
  | { ok: true; address: AddressDTO }
  | { ok: false; status: number; error: string }

export type DeleteResult = { ok: true } | { ok: false; status: number; error: string }

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    return body.error ?? "Something went wrong."
  } catch {
    return "Something went wrong."
  }
}

/** Create a new address. `makeDefault`/first-address defaulting is decided server-side (019). */
export async function createAddress(body: CreateAddressRequest): Promise<SaveResult> {
  const res = await fetch("/api/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) return { ok: false, status: res.status, error: await parseError(res) }
  return { ok: true, address: (await res.json()) as AddressDTO }
}

/** Edit an existing address (fields and/or `makeDefault`). */
export async function updateAddress(id: string, body: UpdateAddressRequest): Promise<SaveResult> {
  const res = await fetch(`/api/addresses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) return { ok: false, status: res.status, error: await parseError(res) }
  return { ok: true, address: (await res.json()) as AddressDTO }
}

/** Set an address as the default. Server-side exactly-one CTE clears the prior one; idempotent (FR-014). */
export async function setDefault(id: string): Promise<SaveResult> {
  return updateAddress(id, { makeDefault: true })
}

/** Delete an address. `{ ok:false, status:409 }` = the delete-default guard refused it (backstop). */
export async function deleteAddress(id: string): Promise<DeleteResult> {
  const res = await fetch(`/api/addresses/${id}`, { method: "DELETE" })
  if (!res.ok) return { ok: false, status: res.status, error: await parseError(res) }
  return { ok: true }
}
