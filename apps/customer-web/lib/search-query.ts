import type { FacetSetDTO, ProductSearchResultDTO, ProductSort } from "@effy/shared-types"

/**
 * A listing's refinement, and the backend query it becomes — ONE definition, read by the server (which
 * renders the first page) and by the browser (which refines and pages).
 *
 * ⚠ The two must build the SAME string from the same address: the browser shows what the server sent
 * only when the server's query is the one it would have asked itself (`SearchInitial.query`). A
 * second builder that ordered a parameter differently would not show anything wrong — it would
 * quietly ask twice.
 */
export interface Refinement {
  q: string
  category: string | null
  saleOnly: boolean
  minPrice: string
  maxPrice: string
  sort: ProductSort
  brands: string[]
  /** Every `attr.<key>` param, collapsed to key → values[]. */
  attributes: Record<string, string[]>
}

export const PAGE_SIZE = 24

/** The first page of a listing as the server read it, handed to the browser to start from. */
export interface SearchInitial {
  /** `productsQuery` of the refinement this answers. */
  query: string
  /** When the server read it — tells one render's answer from the next. */
  at: number
  result: ProductSearchResultDTO
  /** Null when the counts could not be read; the browser asks for them itself. */
  facets: FacetSetDTO | null
}

export function readRefinement(params: URLSearchParams): Refinement {
  const attributes: Record<string, string[]> = {}
  for (const [key, value] of params.entries()) {
    if (key.startsWith("attr.") && value) (attributes[key.slice(5)] ??= []).push(value)
  }
  return {
    q: params.get("q") ?? "",
    category: params.get("category"),
    saleOnly: params.get("saleOnly") === "true",
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    sort: (params.get("sort") as ProductSort | null) ?? "newest",
    brands: params.getAll("brand"),
    attributes,
  }
}

function filters(r: Refinement): URLSearchParams {
  const p = new URLSearchParams()
  if (r.q.trim()) p.set("q", r.q.trim())
  if (r.category) p.set("categoryKey", r.category)
  if (r.saleOnly) p.set("saleOnly", "true")
  if (r.minPrice) p.set("minPrice", r.minPrice)
  if (r.maxPrice) p.set("maxPrice", r.maxPrice)
  for (const b of r.brands) p.append("brand", b)
  for (const [key, vals] of Object.entries(r.attributes)) for (const v of vals) p.append(`attr.${key}`, v)
  return p
}

/** The query string of `/storefront/v1/facets` — the filters, no sort and no paging. */
export function facetsQuery(r: Refinement): string {
  return filters(r).toString()
}

/** The query string of `/storefront/v1/products` for one page; no cursor is the first. */
export function productsQuery(r: Refinement, cursor?: string | null): string {
  const p = filters(r)
  p.set("sort", r.sort)
  if (cursor) p.set("cursor", cursor)
  p.set("limit", String(PAGE_SIZE))
  return p.toString()
}
