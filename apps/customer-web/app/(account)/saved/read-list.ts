import "server-only"

import { DEFAULT_LIST_ID, type SavedItemDTO, type SavedListDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"

/**
 * One list's page data (068): every list for the tab row, and this list's products.
 *
 * `items` is `null` when the list does not exist for this shopper — deleted on another device, or
 * never theirs. The default list always exists.
 *
 * ⚠ A failed read renders an empty list rather than an error page, as the saved list always has:
 * the next load repairs it. The tab row falls back to "Saved" alone so the page still has a home.
 */
export async function readList(
  accessToken: string | null | undefined,
  listId: string,
): Promise<{ lists: SavedListDTO[]; items: SavedItemDTO[] | null }> {
  const api = coreApi(accessToken)
  const [lists, items] = await Promise.all([
    api.get<SavedListDTO[]>("/v1/lists", uncached()).catch(() => null),
    api
      .get<SavedItemDTO[]>(`/v1/lists/${encodeURIComponent(listId)}/items`, uncached())
      .catch((err: { status?: number }) => (err?.status === 404 ? null : ([] as SavedItemDTO[]))),
  ])
  return {
    lists: lists ?? [{ id: DEFAULT_LIST_ID, isDefault: true, name: null, count: 0, onlyHereCount: 0 }],
    items,
  }
}
