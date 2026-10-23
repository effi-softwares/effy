import "server-only"

import { DEFAULT_LIST_ID, type SavedItemDTO, type SavedListDTO } from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"

/**
 * One list's page data: every list for the tab row, and this list's products. `items` is null when the
 * list does not exist for this shopper. A failed read renders an empty list (the next load repairs it).
 */
export async function readList(
  session: { idToken: string; accessToken?: string | null } | null | undefined,
  listId: string,
): Promise<{ lists: SavedListDTO[]; items: SavedItemDTO[] | null }> {
  // No session: the empty default list, as a failed read would show.
  if (!session?.idToken) {
    return { lists: [{ id: DEFAULT_LIST_ID, isDefault: true, name: null, count: 0, onlyHereCount: 0 }], items: [] }
  }
  const api = edgeApi(session)
  const [lists, items] = await Promise.all([
    api.get<SavedListDTO[]>("/commerce/v1/lists", perCustomer).catch(() => null),
    api
      .get<SavedItemDTO[]>(`/commerce/v1/lists/${encodeURIComponent(listId)}/items`, perCustomer)
      .catch((err: { status?: number }) => (err?.status === 404 ? null : ([] as SavedItemDTO[]))),
  ])
  return {
    lists: lists ?? [{ id: DEFAULT_LIST_ID, isDefault: true, name: null, count: 0, onlyHereCount: 0 }],
    items,
  }
}
