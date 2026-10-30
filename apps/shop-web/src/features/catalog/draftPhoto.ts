import { createStore, del, get, set } from "idb-keyval"

import { draftKey } from "@effy/web-kit/product-form"

// The new-product draft is JSON in localStorage, which cannot hold a picture: its photo is kept here, in
// IndexedDB (a File survives as itself), under the same per-shop, per-person key.
let store: ReturnType<typeof createStore> | null = null
function photos() {
  if (typeof indexedDB === "undefined") return null
  return (store ??= createStore("effy-shop.drafts", "photos"))
}

export async function loadDraftPhoto(shopId: string, subject: string): Promise<File | null> {
  const s = photos()
  if (!s) return null
  try {
    const file = await get<unknown>(draftKey(shopId, subject), s)
    return file instanceof Blob ? (file as File) : null
  } catch {
    return null
  }
}

/** Saves the photo, or forgets it when the shop removes it (`null`). */
export async function saveDraftPhoto(shopId: string, subject: string, file: File | null): Promise<void> {
  const s = photos()
  if (!s) return
  try {
    if (file) await set(draftKey(shopId, subject), file, s)
    else await del(draftKey(shopId, subject), s)
  } catch {}
}

export async function clearDraftPhoto(shopId: string, subject: string): Promise<void> {
  await saveDraftPhoto(shopId, subject, null)
}
