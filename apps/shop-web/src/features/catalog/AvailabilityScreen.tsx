import { useEffect } from "react"

import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { ArrowDown, CircleAlert, CircleSlash, ImageOff, ToggleRight } from "lucide-react"

import type { AvailabilityFilter, ShopAvailabilityDTO, ShopAvailabilityRowDTO } from "@effy/shared-types"
import { Badge, Label, Switch, toast } from "@effy/design-system/ui"
import { DataTable, ListPage, listQueryOptions, SearchBox, useListState, ViewSelect, type EffyColumnDef } from "@effy/web-kit/data-table"
import { PageHeader } from "@effy/web-kit/patterns"

import { track } from "@/lib/telemetry"

import { AVAILABILITY_ROOT, availabilityList, fetchAvailabilityPage, useToggleSale } from "./availability"
import { productMutationError } from "./errorText"

const VIEWS: readonly { key: AvailabilityFilter; label: string; count: keyof ShopAvailabilityDTO["counts"] }[] = [
  { key: "needs_look", label: "Needs a look", count: "needsLook" },
  { key: "out_of_stock", label: "Out of stock", count: "outOfStock" },
  { key: "low_stock", label: "Low stock", count: "lowStock" },
  { key: "off_sale", label: "Off sale", count: "offSale" },
  { key: "all", label: "Everything", count: "all" },
]

const columns: EffyColumnDef<ShopAvailabilityRowDTO>[] = [
  {
    id: "product",
    header: "Product",
    cell: ({ row }) => (
      <span className="flex items-center gap-3">
        {row.original.imageUrl ? (
          <img src={row.original.imageUrl} alt="" className="size-10 shrink-0 rounded-lg border object-cover" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <ImageOff aria-hidden="true" className="size-4" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block max-w-[36ch] truncate">{row.original.productName}</span>
          {row.original.brand ? <span className="block text-sm font-normal text-muted-foreground">{row.original.brand}</span> : null}
        </span>
      </span>
    ),
    meta: { label: "Product", identifying: true, phone: "primary", sortKey: "name" },
  },
  { id: "size", header: "Size", cell: ({ row }) => row.original.label ?? <span className="text-muted-foreground">One size</span>, meta: { label: "Size" } },
  {
    id: "stock",
    header: "In stock",
    cell: ({ row }) => (row.original.stock.tracked ? (row.original.stock.onHand ?? 0) : <span className="text-muted-foreground">Not counted</span>),
    meta: { label: "In stock", align: "numeric", sortKey: "stock" },
  },
  {
    id: "state",
    header: "Status",
    cell: ({ row }) => (
      <span className="flex flex-col items-start gap-1 whitespace-normal">
        <StockWord row={row.original} />
        {row.original.lastOnSale ? <span className="text-xs text-muted-foreground">Last size on sale - make the product unavailable instead</span> : null}
      </span>
    ),
    meta: { label: "Status", phone: "badge" },
  },
  {
    id: "code",
    header: "Your code",
    cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.sku ?? "-"}</span>,
    meta: { label: "Your code", priority: 2 },
  },
  { id: "sale", header: "On sale", cell: ({ row }) => <SaleSwitch row={row.original} />, meta: { label: "On sale", phone: "trail" } },
]

export function AvailabilityScreen() {
  useEffect(() => track({ name: "availability_viewed" }), [])
  const state = useListState(availabilityList, useSearch({ strict: false }))
  const input = { key: AVAILABILITY_ROOT, list: availabilityList, view: state.view, fetch: fetchAvailabilityPage }
  const query = useQuery(listQueryOptions(input))
  const filter: AvailabilityFilter = state.view.filters.filter ?? "needs_look"

  return (
    <ListPage
      header={
        <PageHeader
          back={{ label: "Catalog", link: { to: "/catalog" } }}
          title="Availability"
          description="Switch products off sale instantly when you run out, with no review needed."
        />
      }
    >
      <DataTable
        app="shop-web"
        label="Sizes"
        list={availabilityList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        viewFilters={["filter"]}
        rowId={(r) => r.variantId}
        rowHref={(r) => ({ to: "/catalog/$productId", params: { productId: r.productId }, search: { size: r.variantId } })}
        empty={{
          icon: ToggleRight,
          title: filter === "needs_look" ? "Nothing needs a look" : "No sizes here",
          description:
            filter === "needs_look"
              ? "No size is out of stock or running low. Sizes appear here the moment they do."
              : "Sizes of your live and unavailable products are listed here.",
        }}
        toolbar={
          <>
            <ViewSelect
              label="Show"
              value={filter}
              onChange={(v) => state.setFilter("filter", v === "needs_look" ? undefined : v)}
              options={VIEWS.map((v) => ({ value: v.key, label: v.label, count: query.data?.counts[v.count], attention: v.key === "out_of_stock" }))}
            />
            <SearchBox label="Search sizes" placeholder="Product, size or barcode…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
      <p className="text-sm text-muted-foreground">
        A size with 0 in stock already can&apos;t be bought while its stock is counted. Switch it off when the count is
        wrong or you can&apos;t sell it today.
      </p>
    </ListPage>
  )
}

function StockWord({ row }: { row: ShopAvailabilityRowDTO }) {
  if (!row.onSale)
    return (
      <Badge variant="quiet">
        <CircleSlash aria-hidden="true" />
        Off sale
      </Badge>
    )
  if (row.stock.outOfStock)
    return (
      <Badge variant="destructive">
        <CircleAlert aria-hidden="true" />
        Out of stock
      </Badge>
    )
  if (row.stock.low)
    return (
      <Badge variant="warning">
        <ArrowDown aria-hidden="true" />
        Low stock
      </Badge>
    )
  return null
}

function SaleSwitch({ row }: { row: ShopAvailabilityRowDTO }) {
  const toggle = useToggleSale()
  const name = row.label ? `${row.productName} · ${row.label}` : row.productName
  return (
    // The switch is not the row: toggling it never opens the product.
    <Label className="gap-3 font-normal" onClick={(e) => e.stopPropagation()}>
      <span className="text-muted-foreground">{row.onSale ? "On sale" : "Off sale"}</span>
      <Switch
        checked={row.onSale}
        aria-label={`${name} on sale`}
        disabled={toggle.isPending || row.lastOnSale}
        onCheckedChange={(on) =>
          toggle.mutate(
            { productId: row.productId, variantId: row.variantId, onSale: on },
            {
              onSuccess: () => {
                track({ name: "availability_toggled", onSale: on })
                toast(on ? `${name} is on sale again` : `${name} is off sale`)
              },
              onError: (err) => toast.error(productMutationError(err)),
            },
          )
        }
      />
    </Label>
  )
}
