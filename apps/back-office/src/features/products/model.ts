import {
  BACKOFFICE_PRODUCT_SORTS,
  isBackOfficeProductTab,
  STORAGES,
  type BackOfficeProductSort,
  type BackOfficeProductTab,
  type Storage,
} from "@effy/shared-types"

/** The list's view, carried by the URL so a link opens the same list for anyone (FR-007). */
export interface ProductSearch {
  q?: string
  shopId?: string
  categoryId?: string
  state?: BackOfficeProductTab
  storage?: Storage
  margin?: "set" | "not_set"
  missingDetails?: true
  lowStock?: true
  sort?: BackOfficeProductSort
  dir?: "asc" | "desc"
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined)
const uuid = (v: unknown) => {
  const s = str(v)
  return s && UUID.test(s) ? s : undefined
}
const flag = (v: unknown): true | undefined => (v === true || v === "true" ? true : undefined)

/** Anything unknown in the URL is dropped, never an error: an old link still opens the list. */
export function parseProductSearch(raw: Record<string, unknown>): ProductSearch {
  const out: ProductSearch = {}
  const q = str(raw.q)
  if (q) out.q = q.slice(0, 200)
  const shopId = uuid(raw.shopId)
  if (shopId) out.shopId = shopId
  const categoryId = uuid(raw.categoryId)
  if (categoryId) out.categoryId = categoryId
  if (isBackOfficeProductTab(raw.state) && raw.state !== "all") out.state = raw.state
  if (typeof raw.storage === "string" && (STORAGES as readonly string[]).includes(raw.storage))
    out.storage = raw.storage as Storage
  if (raw.margin === "set" || raw.margin === "not_set") out.margin = raw.margin
  if (flag(raw.missingDetails)) out.missingDetails = true
  if (flag(raw.lowStock)) out.lowStock = true
  if (
    typeof raw.sort === "string" &&
    (BACKOFFICE_PRODUCT_SORTS as readonly string[]).includes(raw.sort) &&
    raw.sort !== "updated"
  ) {
    out.sort = raw.sort as BackOfficeProductSort
  }
  if (raw.dir === "asc" || raw.dir === "desc") out.dir = raw.dir
  return out
}

export function toQueryString(search: ProductSearch, cursor: string | null): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(search)) {
    if (v !== undefined) p.set(k, String(v))
  }
  if (cursor) p.set("cursor", cursor)
  return p.toString()
}

/** Any filter beyond the tab and the sort. */
export const hasFilters = (s: ProductSearch) =>
  Boolean(s.q || s.shopId || s.categoryId || s.storage || s.margin || s.missingDetails || s.lowStock)

export const clearFilters = (s: ProductSearch): ProductSearch => ({ state: s.state, sort: s.sort, dir: s.dir })
