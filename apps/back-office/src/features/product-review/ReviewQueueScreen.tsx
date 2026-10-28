import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"

import { CircleCheck } from "lucide-react"

import type { MarginNotSetItemDTO, ReviewKind } from "@effy/shared-types"
import {
  Button,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import {
  EmptyState,
  Facet,
  PageHeader,
  Pager,
  SearchBox,
  StatusWord,
  Toolbar,
  ToolbarSpacer,
  ViewSelect,
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

      <Toolbar>
        <ViewSelect
          label="Review views"
          value={view}
          onChange={setView}
          options={[
            {
              value: "waiting" as const,
              label: "Waiting for review",
              count: oldest.data?.total ?? oldest.data?.items.length,
              attention: true,
            },
            { value: "margin" as const, label: "Margin not set", count: marginCount, attention: true },
          ]}
        />
        {view === "waiting" ? (
          <>
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
            <ToggleGroup
              type="single"
              variant="outline"
              aria-label="Kind"
              value={kind ?? "all"}
              onValueChange={(v) => v && filter(setKind, v === "all" ? null : (v as NonNullable<typeof kind>))}
            >
              {([null, "new_product", "change"] as const).map((k) => (
                <ToggleGroupItem key={k ?? "all"} value={k ?? "all"} className="px-3">
                  {k ? KIND_LABEL[k] : "All"}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        ) : null}
      </Toolbar>

      {view === "margin" ? (
        <MarginNotSet />
      ) : queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : queue.isPending ? (
        <div className="overflow-hidden rounded-xl border bg-card p-4" aria-busy="true">
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
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="min-w-0">
            <Table className="ef-rtable">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.data.items.map((i) => (
                  <TableRow key={`${i.kind}-${i.productId}`}>
                    <TableCell data-m="primary">
                      <Link to="/product-review/$productId" params={{ productId: i.productId }} className="link">
                        {i.productName}
                      </Link>
                      <div className="mt-0.5 block text-sm text-muted-foreground md:hidden">{i.shopName}</div>
                    </TableCell>
                    <TableCell data-m="meta" className="text-muted-foreground max-md:hidden">
                      {i.shopName}
                    </TableCell>
                    <TableCell data-m="badge">
                      <StatusWord tone={i.kind === "new_product" ? "info" : "waiting"}>{KIND_LABEL[i.kind]}</StatusWord>
                    </TableCell>
                    <TableCell data-m="trail" className="tabular-nums">
                      {waitingLabel(i.waitingHours)}
                      {i.waitingHours >= 24 ? (
                        <span className="mt-0.5 block text-sm text-muted-foreground ml-2 font-medium text-foreground">
                          Over a day
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right max-md:hidden">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/product-review/$productId" params={{ productId: i.productId }}>
                          Review
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="min-w-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead className="text-right">Lowest shop price</TableHead>
                <TableHead>{canDecide ? "Set margin" : ""}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((p) => (
                <MarginNotSetRow key={p.productId} product={p} canDecide={canDecide} />
              ))}
            </TableBody>
          </Table>
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
    <TableRow className="align-top">
      <TableCell className="font-medium">{product.productName}</TableCell>
      <TableCell className="text-muted-foreground">{product.shopName}</TableCell>
      <TableCell className="text-right tabular-nums">{money(product.shopPriceAmount)}</TableCell>
      <TableCell>
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
      </TableCell>
    </TableRow>
  )
}
