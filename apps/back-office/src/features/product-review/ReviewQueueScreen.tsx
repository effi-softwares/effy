import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { CircleCheck } from "lucide-react"

import type { MarginNotSetItemDTO, ReviewKind } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Button, Skeleton, Tabs, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import {
  PageHeader,
  EmptyState,
  StatusWord,
  Facet,
  Pager,
  SearchBox,
  Toolbar,
  ToolbarSpacer,
} from "@effy/web-kit/patterns"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { shopListQuery } from "@/features/shops/queries"
import { money } from "@/lib/format"
import { track } from "@/lib/telemetry"

import { canDecideReview } from "./access"
import { reviewActionError } from "./errorText"
import { MarginField } from "./MarginField"
import { KIND_LABEL, toMargin, waitingLabel, type MarginEntry } from "./model"
import { marginNotSetQuery, reviewQueueQuery, useSetMargin } from "./queries"

export function ReviewQueueScreen() {
  const [view, setView] = useState<"waiting" | "margin">("waiting")
  const [q, setQ] = useState("")
  const [kind, setKind] = useState<ReviewKind | null>(null)
  const [shopId, setShopId] = useState<string | null>(null)
  const [cursors, setCursors] = useState<string[]>([])
  const cursor = cursors[cursors.length - 1] ?? null
  const queue = useQuery(reviewQueueQuery({ q, kind, shopId, cursor }))
  const oldest = useQuery(reviewQueueQuery({ q: "", kind: null, shopId: null, cursor: null }))
  const marginFirst = useQuery(marginNotSetQuery(null))
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 100 }))

  function filter<T>(set: (v: T) => void, value: T) {
    set(value)
    setCursors([])
  }

  const first = oldest.data?.items[0]
  const marginCount = marginFirst.data
    ? marginFirst.data.items.length + (marginFirst.data.nextCursor ? "+" : "")
    : undefined

  return (
    <>
      <PageHeader
        title="Product review"
        description="Approve or send back new products and changes that shops submit before they go live."
        actions={
          first ? (
            <Button asChild>
              <Link to="/product-review/$productId" params={{ productId: first.productId }}>
                Review the oldest
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList aria-label="Review views">
            {(
              [
                { key: "waiting", label: "Waiting for review", count: oldest.data?.total ?? oldest.data?.items.length },
                { key: "margin", label: "Margin not set", count: marginCount },
              ] as const
            ).map((v) => (
              <TabsTrigger key={v.key} value={v.key}>
                {v.label}
                {v.count !== undefined ? <TabsCount tone="primary">{v.count}</TabsCount> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {view === "waiting" ? (
          <Toolbar>
            <SearchBox
              label="Search by product name"
              placeholder="Search by product name"
              value={q}
              onChange={(v) => filter(setQ, v)}
            />
            <Facet
              label="Shop"
              anyLabel="All shops"
              value={shopId}
              onChange={(v) => filter(setShopId, v)}
              options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
            <ToolbarSpacer />
            <div role="group" aria-label="Kind" className="ef-seg">
              {([null, "new_product", "change"] as const).map((k) => (
                <button
                  key={k ?? "all"}
                  type="button"
                  className={cn(kind === k && "is-active")}
                  aria-pressed={kind === k}
                  onClick={() => filter(setKind, k)}
                >
                  {k ? KIND_LABEL[k] : "All"}
                </button>
              ))}
            </div>
          </Toolbar>
        ) : null}
      </div>

      {view === "margin" ? (
        <MarginNotSet />
      ) : queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : queue.isPending ? (
        <div className="ef-table-wrap p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : queue.data.items.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing is waiting"
          description="Every product and change a shop has submitted has been decided."
        />
      ) : (
        <div className="ef-table-wrap">
          <div className="ef-table-scroll">
            <table className="ef-table ef-rtable">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Shop</th>
                  <th>Kind</th>
                  <th>Waiting</th>
                  <th className="text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {queue.data.items.map((i) => (
                  <tr key={`${i.kind}-${i.productId}`}>
                    <td data-m="primary">
                      <Link to="/product-review/$productId" params={{ productId: i.productId }} className="link">
                        {i.productName}
                      </Link>
                      <div className="ef-sub md:hidden">{i.shopName}</div>
                    </td>
                    <td data-m="meta" className="is-muted max-md:hidden">
                      {i.shopName}
                    </td>
                    <td data-m="badge">
                      <StatusWord tone={i.kind === "new_product" ? "info" : "waiting"}>{KIND_LABEL[i.kind]}</StatusWord>
                    </td>
                    <td data-m="trail" className="tabular-nums">
                      {waitingLabel(i.waitingHours)}
                      {i.waitingHours >= 24 ? (
                        <span className="ef-sub ml-2 font-medium text-foreground">Over a day</span>
                      ) : null}
                    </td>
                    <td className="text-right max-md:hidden">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/product-review/$productId" params={{ productId: i.productId }}>
                          Review
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cursors.length > 0 || queue.data.nextCursor ? (
            <Pager
              summary={`${queue.data.items.length} shown · page ${cursors.length + 1}`}
              canBack={cursors.length > 0}
              canNext={Boolean(queue.data.nextCursor)}
              onBack={() => setCursors((c) => c.slice(0, -1))}
              onNext={() => queue.data.nextCursor && setCursors([...cursors, queue.data.nextCursor])}
            />
          ) : null}
        </div>
      )}
    </>
  )
}

function MarginNotSet() {
  const [cursors, setCursors] = useState<string[]>([])
  const list = useQuery(marginNotSetQuery(cursors[cursors.length - 1] ?? null))
  const canDecide = canDecideReview(useSessionRoles())

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  if (list.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (list.data.items.length === 0 && cursors.length > 0) {
    return (
      <Button size="sm" variant="outline" onClick={() => setCursors([])}>
        Back to the first page
      </Button>
    )
  }
  if (list.data.items.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Every product has a margin"
        description="Nothing on sale is selling at the shop's own price."
      />
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        These are on sale at the shop's own price. Setting a margin changes what customers pay straight away.
      </p>
      <div className="ef-table-wrap">
        <div className="ef-table-scroll">
          <table className="ef-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Shop</th>
                <th className="text-right">Lowest shop price</th>
                <th>{canDecide ? "Set margin" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((p) => (
                <MarginNotSetRow key={p.productId} product={p} canDecide={canDecide} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {cursors.length > 0 || list.data.nextCursor ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={cursors.length === 0} onClick={() => setCursors([])}>
            First page
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!list.data.nextCursor}
            onClick={() => list.data.nextCursor && setCursors([...cursors, list.data.nextCursor])}
          >
            Next page
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function MarginNotSetRow({ product, canDecide }: { product: MarginNotSetItemDTO; canDecide: boolean }) {
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

  return (
    <tr className="align-top">
      <td className="font-medium">{product.productName}</td>
      <td className="is-muted">{product.shopName}</td>
      <td className="text-right tabular-nums">{money(product.shopPriceAmount)}</td>
      <td>
        {!canDecide ? null : !open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Set margin
          </Button>
        ) : (
          <div className="space-y-2">
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
        )}
      </td>
    </tr>
  )
}
