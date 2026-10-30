import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { CircleCheck, ImageOff } from "lucide-react"

import type { MarginNotSetItemDTO, ReviewKind, ReviewQueueItemDTO } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"
import {
  DataTable,
  Facet,
  ListPage,
  listQueryOptions,
  SearchBox,
  useListState,
  viewsQueryOptions,
  ViewSelect,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { PageHeader, StatusWord } from "@effy/web-kit/patterns"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { cn } from "@/lib/utils"
import { shopListQuery } from "@/features/shops/queries"
import { money, moment } from "@/lib/format"
import { track } from "@/lib/telemetry"

import { canDecideReview } from "./access"
import { reviewActionError } from "./errorText"
import { marginNotSetList, REVIEW_KEY, REVIEW_VIEWS, reviewQueueList, type ReviewView } from "./list"
import { MarginField } from "./MarginField"
import { KIND_LABEL, toMargin, waitingLabel, type MarginEntry } from "./model"
import { reviewQueueQuery, useSetMargin } from "./queries"
import { fetchMarginNotSetPage, fetchQueuePage, fetchQueueViews } from "./repo"

/** One line on what a queue row is: what a change touches, or how a new product is sold. */
function queueLine(r: ReviewQueueItemDTO): string {
  if (r.kind === "change") return r.changes.length > 0 ? `Changes ${r.changes.join(", ").toLowerCase()}` : "A change"
  return `New · ${r.sizeCount === 1 ? "one size" : `${r.sizeCount} sizes`}`
}

const queueColumns: EffyColumnDef<ReviewQueueItemDTO>[] = [
  {
    id: "product",
    header: "Product",
    // What the reviewer is about to open: its picture, its name and one line on what it is.
    cell: ({ row }) => {
      const r = row.original
      return (
        <span className="flex min-w-0 items-center gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
            {r.imageUrl ? (
              <img src={r.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <ImageOff aria-hidden="true" className="size-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{r.productName}</span>
            <span className="block truncate text-[13px] text-muted-foreground">{queueLine(r)}</span>
          </span>
        </span>
      )
    },
    meta: { label: "Product", identifying: true, phone: "primary" },
  },
  {
    id: "shop",
    header: "Shop",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.shopName}</span>,
    meta: { label: "Shop", sortKey: "shop" },
  },
  {
    id: "kind",
    header: "Kind",
    cell: ({ row }) => (
      <StatusWord tone={row.original.kind === "new_product" ? "info" : "quiet"}>
        {KIND_LABEL[row.original.kind]}
      </StatusWord>
    ),
    meta: { label: "Kind", phone: "badge" },
  },
  {
    id: "waiting",
    header: "Waiting for",
    // Urgency at a glance: from a day it is orange, from two red.
    cell: ({ row }) => {
      const h = row.original.waitingHours
      return (
        <span
          className={cn(
            "inline-flex items-center gap-2 font-medium tabular-nums",
            h >= 48 ? "text-destructive" : h >= 24 ? "text-accent2" : "text-muted-foreground",
          )}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {waitingLabel(h)}
        </span>
      )
    },
    meta: { label: "Waiting for", sortKey: "waiting", phone: "trail" },
  },
  {
    id: "submitted",
    header: "Submitted",
    cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.submittedAt)}</span>,
    meta: { label: "Submitted", priority: 3, phone: "hide" },
  },
]

export function ReviewQueueScreen() {
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const navigate = useNavigate()
  const view: ReviewView = REVIEW_VIEWS.includes(search.view as ReviewView) ? (search.view as ReviewView) : "waiting"
  const setView = (v: ReviewView) =>
    void navigate({ to: ".", search: { view: v === "waiting" ? undefined : v } as never })

  const oldest = useQuery(reviewQueueQuery({}))
  const margin = useQuery(
    listQueryOptions({
      key: REVIEW_KEY,
      list: marginNotSetList,
      view: marginNotSetList.initial(),
      fetch: fetchMarginNotSetPage,
    }),
  )
  const first = oldest.data?.items[0]

  const viewSelect = (
    <ViewSelect
      label="Review views"
      value={view}
      onChange={setView}
      options={[
        { value: "waiting" as const, label: "Waiting for review", count: oldest.data?.total, attention: true },
        { value: "margin" as const, label: "Margin not set", count: margin.data?.total, attention: true },
      ]}
    />
  )

  return (
    <ListPage
      header={
        <PageHeader
          title="Product review"
          description="New products and changes shops send to Effy. Customers see nothing new until it is approved."
          actions={
            first ? (
              <Button asChild>
                <Link to="/product-review/$productId" params={{ productId: first.productId }}>
                  Start reviewing
                </Link>
              </Button>
            ) : undefined
          }
        />
      }
    >
      {view === "margin" ? (
        <MarginNotSet viewSelect={viewSelect} search={search} />
      ) : (
        <Queue viewSelect={viewSelect} search={search} />
      )}
    </ListPage>
  )
}

function Queue({ viewSelect, search }: { viewSelect: React.ReactNode; search: Record<string, unknown> }) {
  const state = useListState(reviewQueueList, search)
  const input = { key: REVIEW_KEY, list: reviewQueueList, view: state.view, fetch: fetchQueuePage }
  const query = useQuery(listQueryOptions(input))
  const kinds = useQuery(
    viewsQueryOptions({
      key: REVIEW_KEY,
      list: reviewQueueList,
      view: state.view,
      except: ["kind"],
      fetch: fetchQueueViews,
    }),
  )
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 100 }))
  return (
    <DataTable
      app="back-office"
      label="Waiting for review"
      list={reviewQueueList}
      state={state}
      columns={queueColumns}
      query={query}
      queryInput={input}
      rowId={(i) => `${i.kind}-${i.productId}`}
      rowHref={(i) => ({ to: "/product-review/$productId", params: { productId: i.productId } })}
      empty={{
        icon: CircleCheck,
        title: "Nothing is waiting",
        description: "Every product and change a shop has submitted has been decided.",
      }}
      toolbar={
        <>
          {viewSelect}
          <Facet
            label="Kind"
            anyLabel={`Any kind${kinds.data ? ` (${kinds.data.views.all})` : ""}`}
            value={state.view.filters.kind ?? null}
            onChange={(v) => state.setFilter("kind", v ?? undefined)}
            options={(["new_product", "change"] as const satisfies readonly ReviewKind[]).map((k) => ({
              value: k,
              label: kinds.data ? `${KIND_LABEL[k]} (${kinds.data.views[k]})` : KIND_LABEL[k],
            }))}
          />
          <Facet
            label="Shop"
            anyLabel="All shops"
            value={state.view.filters.shopId ?? null}
            onChange={(v) => state.setFilter("shopId", v ?? undefined)}
            options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          <SearchBox
            label="Search review"
            placeholder="Product or shop name"
            value={state.draftQ}
            onChange={state.setQ}
          />
        </>
      }
    />
  )
}

function MarginNotSet({ viewSelect, search }: { viewSelect: React.ReactNode; search: Record<string, unknown> }) {
  const state = useListState(marginNotSetList, search)
  const input = { key: REVIEW_KEY, list: marginNotSetList, view: state.view, fetch: fetchMarginNotSetPage }
  const query = useQuery(listQueryOptions(input))
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 100 }))
  const canDecide = canDecideReview(useSessionRoles())

  const columns: EffyColumnDef<MarginNotSetItemDTO>[] = [
    {
      id: "product",
      header: "Product",
      cell: ({ row }) => row.original.productName,
      meta: { label: "Product", identifying: true, phone: "primary", sortKey: "name" },
    },
    {
      id: "shop",
      header: "Shop",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.shopName}</span>,
      meta: { label: "Shop", sortKey: "shop" },
    },
    {
      id: "price",
      header: "Lowest shop price",
      cell: ({ row }) => money(row.original.shopPriceAmount),
      meta: { label: "Lowest shop price", align: "numeric", priority: 2, phone: "trail" },
    },
    {
      id: "since",
      header: "Since",
      cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.approvedAt)}</span>,
      meta: { label: "On sale since", sortKey: "since" },
    },
    ...(canDecide
      ? [
          {
            id: "set",
            header: "Set margin",
            cell: ({ row }) => <MarginCell product={row.original} />,
            meta: { label: "Set margin", phone: "full" },
          } satisfies EffyColumnDef<MarginNotSetItemDTO>,
        ]
      : []),
  ]

  return (
    <DataTable
      app="back-office"
      label="Margin not set"
      list={marginNotSetList}
      state={state}
      columns={columns}
      query={query}
      queryInput={input}
      rowId={(p) => p.productId}
      empty={{
        icon: CircleCheck,
        title: "Every product has a margin",
        description: "Nothing on sale is selling at the shop's own price.",
      }}
      above={
        <p className="text-sm text-muted-foreground">
          These are on sale at the shop's own price. Setting a margin changes what customers pay straight away.
        </p>
      }
      toolbar={
        <>
          {viewSelect}
          <Facet
            label="Shop"
            anyLabel="All shops"
            value={state.view.filters.shopId ?? null}
            onChange={(v) => state.setFilter("shopId", v ?? undefined)}
            options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          <SearchBox label="Search products" placeholder="Product name" value={state.draftQ} onChange={state.setQ} />
        </>
      }
    />
  )
}

/** Set a margin in place; the row leaves the list once it is saved (the list re-reads). */
function MarginCell({ product }: { product: MarginNotSetItemDTO }) {
  const [open, setOpen] = useState(false)
  const [entry, setEntry] = useState<MarginEntry>({ kind: "percent", value: "" })
  const [message, setMessage] = useState<string | null>(null)
  const setMargin = useSetMargin()
  const margin = toMargin(entry)

  async function save() {
    if (!margin) return
    setMessage(null)
    try {
      await setMargin.mutateAsync({ productId: product.productId, body: { margin, expectedCurrent: null } })
      track({ name: "product_margin_set", productId: product.productId })
    } catch (err) {
      setMessage(reviewActionError(err))
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Set margin
      </Button>
    )
  }
  return (
    <div className="space-y-2 whitespace-normal">
      <MarginField
        id={`margin-${product.productId}`}
        shopPrices={[product.shopPriceAmount]}
        value={entry}
        onChange={setEntry}
        disabled={setMargin.isPending}
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={!margin || setMargin.isPending} onClick={() => void save()}>
          Save margin
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {message ? (
        <p role="alert" className="text-sm font-medium">
          {message}
        </p>
      ) : null}
    </div>
  )
}
