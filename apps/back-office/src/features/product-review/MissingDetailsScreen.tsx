import { useMemo } from "react"

import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { CircleCheck } from "lucide-react"

import type { MissingDetailsItemDTO } from "@effy/shared-types"
import {
  DataTable,
  Facet,
  ListPage,
  listQueryOptions,
  SearchBox,
  useListState,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { PageHeader } from "@effy/web-kit/patterns"

import { shopListQuery } from "@/features/shops/queries"
import { pathText } from "@/features/taxonomy/model"
import { treeQuery } from "@/features/taxonomy/queries"

import { missingDetailsList, REVIEW_KEY } from "./list"
import { fetchMissingDetailsPage } from "./repo"

const columns: EffyColumnDef<MissingDetailsItemDTO>[] = [
  {
    id: "product",
    header: "Product",
    cell: ({ row }) => row.original.name,
    meta: { label: "Product", identifying: true, phone: "primary" },
  },
  {
    id: "shop",
    header: "Shop",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.shopName}</span>,
    meta: { label: "Shop", sortKey: "shop" },
  },
  {
    id: "category",
    header: "Category",
    cell: ({ row }) => <span className="text-muted-foreground">{pathText(row.original.categoryPath)}</span>,
    meta: { label: "Category", priority: 2 },
  },
  {
    id: "missing",
    header: "Missing",
    cell: ({ row }) => <span className="whitespace-normal">{row.original.missing.join(", ")}</span>,
    meta: { label: "Missing", sortKey: "missing", phone: "full" },
  },
]

/**
 * Products already on sale that lack a detail their category now requires (101). They stay on sale; the
 * shop is asked to fill it in from its own catalogue, and the next change it submits must include it.
 */
export function MissingDetailsScreen() {
  const state = useListState(missingDetailsList, useSearch({ strict: false }))
  const input = { key: REVIEW_KEY, list: missingDetailsList, view: state.view, fetch: fetchMissingDetailsPage }
  const query = useQuery(listQueryOptions(input))
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 100 }))
  const tree = useQuery(treeQuery())
  // Departments only: deep enough to narrow a list of exceptions.
  const departments = useMemo(
    () =>
      (tree.data ?? [])
        .filter((c) => c.status === "active" && c.parentId === null)
        .map((c) => ({ value: c.id, label: c.name })),
    [tree.data],
  )

  return (
    <ListPage
      header={
        <PageHeader
          title="Products missing details"
          description="On sale before their category required these details. They stay on sale; shops see the same list in their catalogue."
        />
      }
    >
      <DataTable
        app="back-office"
        label="Products missing details"
        list={missingDetailsList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        rowId={(p) => p.productId}
        rowHref={(p) => ({ to: "/product-review/$productId", params: { productId: p.productId } })}
        empty={{
          icon: CircleCheck,
          title: "Nothing is missing",
          description: "Every product on sale has the details its category requires.",
        }}
        toolbar={
          <>
            <Facet
              label="Shop"
              anyLabel="All shops"
              value={state.view.filters.shopId ?? null}
              onChange={(v) => state.setFilter("shopId", v ?? undefined)}
              options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
            <Facet
              label="Department"
              anyLabel="Every department"
              value={state.view.filters.categoryId ?? null}
              onChange={(v) => state.setFilter("categoryId", v ?? undefined)}
              options={departments}
            />
            <SearchBox label="Search products" placeholder="Product name" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
    </ListPage>
  )
}
