import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { PackageCheck } from "lucide-react"

import type { LowStockRowDTO } from "@effy/shared-types"
import { Button, Input, Label } from "@effy/design-system/ui"
import { DataTable, Facet, listQueryOptions, SearchBox, useListState, type EffyColumnDef } from "@effy/web-kit/data-table"

import { shopStockList } from "./list"
import { STOCK_ROOT, useSetShopStockSettings } from "./stockQueries"
import { fetchShopLowStockPage } from "./stockRepo"

const columns: EffyColumnDef<LowStockRowDTO>[] = [
  {
    id: "product",
    header: "Product",
    cell: ({ row }) => (
      <>
        {row.original.name}
        {row.original.variantLabel ? <span className="text-muted-foreground"> - {row.original.variantLabel}</span> : null}
      </>
    ),
    meta: { label: "Product", identifying: true, phone: "primary", sortKey: "name" },
  },
  {
    id: "sku",
    header: "SKU",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.sku ?? "-"}</span>,
    meta: { label: "SKU", align: "mono", priority: 2 },
  },
  { id: "onHand", header: "In stock", cell: ({ row }) => row.original.onHand, meta: { label: "In stock", align: "numeric", sortKey: "onHand", phone: "trail" } },
  {
    id: "threshold",
    header: "Threshold",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.effectiveThreshold ?? "-"}</span>,
    meta: { label: "Threshold", align: "numeric", priority: 2 },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.severity === "out" ? <span className="font-semibold">Out of stock</span> : <span>Low</span>,
    meta: { label: "Status", phone: "badge" },
  },
]

export function ShopStockPanel({ shopId, canManage }: { shopId: string; canManage: boolean }) {
  return (
    <div className="space-y-6">
      {canManage ? <ShopDefaultThreshold shopId={shopId} /> : null}
      <LowStockTable shopId={shopId} />
    </div>
  )
}

/** The shop's restock list (103): searched, narrowed and paged by the server, least stock first. */
function LowStockTable({ shopId }: { shopId: string }) {
  const state = useListState(shopStockList, useSearch({ strict: false }))
  const input = {
    key: [...STOCK_ROOT, "low", shopId] as const,
    list: shopStockList,
    view: state.view,
    fetch: (qs: URLSearchParams, signal: AbortSignal) => fetchShopLowStockPage(shopId, qs, signal),
  }
  const query = useQuery(listQueryOptions(input))
  return (
    <DataTable
      app="back-office"
      label="Products to restock"
      list={shopStockList}
      state={state}
      columns={columns}
      query={query}
      queryInput={input}
      rowId={(r) => r.variantId}
      empty={{
        icon: PackageCheck,
        title: "Nothing needs restocking",
        description: "Products this shop does not track never appear here.",
      }}
      toolbar={
        <>
          <Facet
            label="Status"
            anyLabel="Out or low"
            value={state.view.filters.severity ?? null}
            onChange={(v) => state.setFilter("severity", v ?? undefined)}
            options={[
              { value: "out" as const, label: "Out of stock" },
              { value: "low" as const, label: "Low" },
            ]}
          />
          <SearchBox label="Search stock" placeholder="Product or SKU…" value={state.draftQ} onChange={state.setQ} />
        </>
      }
    />
  )
}

function ShopDefaultThreshold({ shopId }: { shopId: string }) {
  const setSettings = useSetShopStockSettings(shopId)
  const [value, setValue] = useState("")

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Shop default low-stock threshold</h3>
      <p className="text-sm text-muted-foreground">
        Applies to every tracked product that does not carry its own threshold. Leave blank to clear it - nothing is
        then reported as running low, though a product that reaches zero is still reported as out of stock.
      </p>
      <div className="flex items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="shop-default-threshold">Threshold</Label>
          <Input
            id="shop-default-threshold"
            inputMode="numeric"
            className="w-32"
            placeholder="None"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={setSettings.isPending}
          onClick={() => setSettings.mutate({ defaultThreshold: value.trim() === "" ? null : Number(value) })}
        >
          Save
        </Button>
      </div>
      {setSettings.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {stockRefusalText(setSettings.error)}
        </p>
      ) : null}
    </section>
  )
}

function stockRefusalText(err: unknown): string {
  const e = err as { status?: number; kind?: string } | null
  if (e?.status === 400 || e?.status === 422) {
    return "Enter a whole number, or leave it blank to clear the threshold."
  }
  if (e?.kind === "forbidden") {
    return "You don't have permission to change this shop's stock settings."
  }
  return "Something went wrong. Please try again."
}
