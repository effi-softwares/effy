"use client"

/**
 * List mutations (068): the shopper's own named lists, and which products are in them.
 *
 * ⚠ NOT IMPORTED BY THE HEART. `SaveControl` is on the guest path with a measured byte budget; this
 * module is reached only from the list chooser (loaded on demand) and the account pages.
 *
 * ⚠ AFTER EVERY CHANGE THE MIRROR IS RE-READ FROM THE PLATFORM rather than patched locally. Whether
 * a product is still saved, and whether it is still in a named list, depends on every list it is in;
 * computing that here would be a second copy of a rule the platform already owns.
 */
import type { SavedItemDTO, SavedListDTO, SavedListRefusal } from "@effy/shared-types"

import { refreshSaved } from "./saved-actions"
import { capture } from "./telemetry"

const kind = (listId: string) => (listId === "default" ? "default" : "named") as "default" | "named"

export type ListResult<T = void> =
  | { ok: true; value: T }
  /** `guest`: the platform answered 401. `failed`: the request never completed, or a 5xx. */
  | { ok: false; reason: SavedListRefusal | "guest" | "not_found" | "failed" }

async function call<T>(path: string, init?: RequestInit): Promise<ListResult<T>> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    return { ok: false, reason: "failed" }
  }
  if (res.ok) {
    const value = res.status === 204 ? undefined : await res.json().catch(() => undefined)
    return { ok: true, value: value as T }
  }
  if (res.status === 401) return { ok: false, reason: "guest" }
  if (res.status >= 500) return { ok: false, reason: "failed" }
  const body = (await res.json().catch(() => ({}))) as { reason?: string }
  return { ok: false, reason: (body.reason as SavedListRefusal | undefined) ?? "failed" }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

/** Every list, default first. With a product, each list says whether it holds it. */
export function fetchLists(productId?: string): Promise<ListResult<SavedListDTO[]>> {
  return call(`/api/lists${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`)
}

export function fetchListItems(listId: string): Promise<ListResult<SavedItemDTO[]>> {
  return call(`/api/lists/${encodeURIComponent(listId)}/items`)
}

/** Create a list; with `productId`, the product is placed in it in the same action (FR-015). */
export async function createList(name: string, productId?: string): Promise<ListResult<SavedListDTO>> {
  const result = await call<SavedListDTO>("/api/lists", json("POST", productId ? { name, productId } : { name }))
  if (result.ok) {
    // ⚠ Where it was made and whether a product came with it. Never `name`.
    capture({
      name: "saved_list_created",
      props: { source: productId ? "chooser" : "lists_page", withProduct: Boolean(productId) },
    })
    if (productId) await refreshSaved()
  }
  return result
}

export function renameList(listId: string, name: string): Promise<ListResult<SavedListDTO>> {
  return call(`/api/lists/${encodeURIComponent(listId)}`, json("PATCH", { name }))
}

/** Products that were only in this list stop being saved, so the mirror is re-read. */
export async function deleteList(listId: string): Promise<ListResult> {
  const result = await call<void>(`/api/lists/${encodeURIComponent(listId)}`, { method: "DELETE" })
  if (result.ok) await refreshSaved()
  return result
}

/** `restoreAddedAt` is set only by undo: the product returns to the position it held. */
export async function addToList(listId: string, productId: string, restoreAddedAt?: string): Promise<ListResult> {
  const result = await call<void>(
    `/api/lists/${encodeURIComponent(listId)}/entries/${encodeURIComponent(productId)}`,
    json("PUT", restoreAddedAt ? { restoreAddedAt } : {}),
  )
  if (result.ok) {
    capture({
      name: "saved_list_entry_added",
      props: { listKind: kind(listId), source: restoreAddedAt ? "undo" : "chooser" },
    })
    await refreshSaved()
  }
  return result
}

/** Takes the product out of THIS list only. */
export async function removeFromList(listId: string, productId: string): Promise<ListResult> {
  const result = await call<void>(
    `/api/lists/${encodeURIComponent(listId)}/entries/${encodeURIComponent(productId)}`,
    { method: "DELETE" },
  )
  if (result.ok) await refreshSaved()
  return result
}

/** The shopper-facing sentence for a refusal. The platform's own prose is never shown. */
export function refusalText(reason: string): string {
  switch (reason) {
    case "name_taken":
      return "You already have a list with that name."
    case "invalid_name":
      return "A list name needs 1 to 40 characters."
    case "list_limit":
      return "You've reached the maximum number of lists. Delete one to make another."
    case "saved_items_cap_reached":
      return "You've reached the maximum number of saved items. Remove one to save another."
    case "list_not_found":
      return "That list no longer exists."
    case "not_found":
      return "That product is no longer available."
    default:
      return "That didn't go through. Please try again."
  }
}

/** How many characters of a list name remain, counted as the platform counts them: code points. */
export function nameRemaining(name: string, max: number): number {
  return max - [...name.trim().replace(/\s+/g, " ")].length
}

/** What the default list is called. Its name is not stored: the platform sends `null`. */
export const DEFAULT_LIST_NAME = "Saved"

export function listLabel(list: Pick<SavedListDTO, "name">): string {
  return list.name ?? DEFAULT_LIST_NAME
}
