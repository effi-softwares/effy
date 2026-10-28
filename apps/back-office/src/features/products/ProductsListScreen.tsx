import { useEffect, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ImageOff, PackageSearch, Plus, Upload } from "lucide-react"

import {
  BACKOFFICE_PRODUCT_STATE_WORDS,
  BACKOFFICE_PRODUCT_TABS,
  PRODUCT_ORIGIN_WORDS,
  STORAGE_WORDS,
  STORAGES,
  type BackOfficeProductRowDTO,
  type BackOfficeProductTab,
  type BulkProductsResultDTO,
} from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Button } from "@effy/design-system/ui"
import {
  DataTable,
  Facet,
  isFiltered,
  ListPage,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  ToolbarSpacer,
  useListState,
  ViewSelect,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { PageHeader, StatusWord } from "@effy/web-kit/patterns"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { marginLabel } from "@/features/product-review/model"
import { shopListQuery } from "@/features/shops/queries"
import { pathText } from "@/features/taxonomy/model"
import { treeQuery } from "@/features/taxonomy/queries"
import { money, moment } from "@/lib/format"

import { canManageProducts } from "./access"
import { BulkDialog, BulkResult, type BulkAction, type Target } from "./BulkDialogs"
import { productsList } from "./model"
import { productKeys } from "./queries"
import { fetchProductPage } from "./repo"
import { STATE_TONE } from "./words"

type Row = BackOfficeProductRowDTO

/** Approved, not archived: only these have a margin to set (a new product gets one at approval). */
const hasMarginToSet = (p: Row) => !["draft", "in_review", "archived"].includes(p.state) || p.effySettingUp

const from = (p: Row, amount: string | null) => (amount === null ? "—" : `${p.priceVaries ? "From " : ""}${money(amount)}`)

/** The columns; the margin cell opens the margin dialog, so it is built with the screen's action. */
function productColumns(onMargin: ((p: Row) => void) | null): EffyColumnDef<Row>[] {
  return [
    {
      id: "product",
      header: "Product",
      cell: ({ row }) => <ProductCell p={row.original} />,
      meta: { label: "Product", identifying: true, phone: "primary", sortKey: "name" },
    },
    {
      id: "shop",
      header: "Shop",
      cell: ({ row }) => (
        <>
          {row.original.shop.name}
          {row.original.shop.status !== "active" ? (
            <span className="mt-0.5 block text-sm text-muted-foreground">Shop {row.original.shop.status}</span>
          ) : null}
        </>
      ),
      meta: { label: "Shop", priority: 2, sortKey: "shop" },
    },
    {
      id: "aisle",
      header: "Aisle",
      cell: ({ row }) => (
        <span className="text-muted-foreground" title={pathText(row.original.categoryPath)}>
          {row.original.categoryPath.at(-1) ?? "—"}
        </span>
      ),
      meta: { label: "Aisle", priority: 2, phone: "hide" },
    },
    { id: "sizes", header: "Sizes", cell: ({ row }) => row.original.variantCount, meta: { label: "Sizes", align: "numeric", priority: 3, phone: "hide" } },
    {
      id: "shopPrice",
      header: "Shop price",
      cell: ({ row }) => from(row.original, row.original.shopPriceFrom),
      meta: { label: "Shop price", align: "numeric", priority: 2, phone: "hide" },
    },
    {
      id: "customerPrice",
      header: "Customers pay",
      cell: ({ row }) => from(row.original, row.original.customerPriceFrom),
      meta: { label: "Customers pay", align: "numeric", sortKey: "price", phone: "trail" },
    },
    {
      id: "margin",
      header: "Margin",
      cell: ({ row }) => {
        const p = row.original
        const text = p.margin ? marginLabel(p.margin) : "Not set"
        return onMargin && hasMarginToSet(p) ? (
          <Button
            type="button"
            variant="link"
            className={cn("font-medium text-foreground", !p.margin && "text-muted-foreground")}
            onClick={(e) => {
              e.stopPropagation()
              onMargin(p)
            }}
          >
            {text}
          </Button>
        ) : (
          <span className={p.margin ? undefined : "text-muted-foreground"}>{text}</span>
        )
      },
      meta: { label: "Margin", priority: 2 },
    },
    {
      id: "state",
      header: "State",
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="flex flex-wrap items-center gap-1">
            <StatusWord tone={STATE_TONE[p.state]}>{BACKOFFICE_PRODUCT_STATE_WORDS[p.state]}</StatusWord>
            {p.effySettingUp ? <StatusWord tone="info">Effy setting up</StatusWord> : null}
            {p.lowStock ? <StatusWord tone="waiting">Low stock</StatusWord> : null}
            {p.missingRequired > 0 ? <StatusWord tone="waiting">Missing details</StatusWord> : null}
          </div>
        )
      },
      meta: { label: "State", phone: "badge" },
    },
    {
      id: "changed",
      header: "Changed",
      cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.updatedAt)}</span>,
      meta: { label: "Changed", priority: 3, sortKey: "updated", phone: "hide" },
    },
  ]
}

/** Catalogue › Products: every product of every shop (102). The view lives in the URL. */
export function ProductsListScreen({ search }: { search: Record<string, unknown> }) {
  const canManage = canManageProducts(useSessionRoles())
  const state = useListState(productsList, search)
  const f = state.view.filters
  const input = { key: productKeys.all, list: productsList, view: state.view, fetch: fetchProductPage }
  const query = useQuery(listQueryOptions(input))
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 100 }))
  const tree = useQuery(treeQuery())

  // Departments and their aisles: deep enough to narrow, short enough to scan.
  const aisles = useMemo(() => {
    const cats = (tree.data ?? []).filter((c) => c.status === "active")
    const byId = new Map(cats.map((c) => [c.id, c]))
    return cats
      .filter((c) => c.parentId === null || byId.get(c.parentId)?.parentId === null)
      .map((c) => {
        const dept = c.parentId ? byId.get(c.parentId)! : c
        return {
          value: c.id,
          label: c.parentId ? c.name : `All of ${c.name}`,
          group: dept.name,
          order: `${dept.position}-${c.parentId ? c.position : -1}`,
        }
      })
      .sort((a, b) => a.group.localeCompare(b.group) || a.order.localeCompare(b.order, undefined, { numeric: true }))
  }, [tree.data])

  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const tab: BackOfficeProductTab = f.state ?? "all"

  // Selection survives paging (it is by product id) and starts again when what is listed changes (103 FR-019).
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const filterKey = JSON.stringify([state.view.q, state.view.filters])
  useEffect(() => setSelected(new Set()), [filterKey])
  // What was selected, kept as rows so a bulk action can name products on other pages.
  const [known, setKnown] = useState<ReadonlyMap<string, Row>>(new Map())
  useEffect(() => {
    if (items.length === 0) return
    setKnown((prev) => {
      const next = new Map(prev)
      for (const p of items) next.set(p.productId, p)
      return next
    })
  }, [items])

  const [action, setAction] = useState<{ kind: BulkAction; targets: Target[] } | null>(null)
  const [result, setResult] = useState<BulkProductsResultDTO | null>(null)
  const names = useMemo(() => new Map([...known.values()].map((p) => [p.productId, p.name])), [known])
  const targetsOf = (rows: readonly Row[]): Target[] =>
    rows.map((p) => ({ productId: p.productId, name: p.name, version: p.version, shopPriceFrom: p.shopPriceFrom, margin: p.margin }))
  const start = (kind: BulkAction, rows: readonly Row[]) => {
    setResult(null)
    setAction({ kind, targets: targetsOf(rows) })
  }
  const chosen = [...selected].flatMap((id) => {
    const p = known.get(id)
    return p ? [p] : []
  })
  const columns = useMemo(() => productColumns(canManage ? (p) => start("margin", [p]) : null), [canManage])

  return (
    <ListPage
      header={
        <PageHeader
          title="Products"
          description="Every product of every shop. Search, narrow and open one to see everything about it."
          actions={
            canManage ? (
              <>
                <Button variant="outline" asChild>
                  <Link to="/products/imports">
                    <Upload aria-hidden="true" />
                    Import a list
                  </Link>
                </Button>
                <Button asChild>
                  <Link to="/products/new">
                    <Plus aria-hidden="true" />
                    New product
                  </Link>
                </Button>
              </>
            ) : undefined
          }
        />
      }
    >
      <BulkDialog
        key={action ? `${action.kind}-${action.targets.length}` : "none"}
        action={action?.kind ?? null}
        targets={action?.targets ?? []}
        onClose={() => setAction(null)}
        onDone={(r) => {
          setAction(null)
          setResult(r)
          setSelected(new Set())
        }}
      />
      <DataTable
        app="back-office"
        label="Products"
        list={productsList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        rowId={(p) => p.productId}
        viewFilters={["state"]}
        rowHref={(p) => ({ to: "/products/$productId", params: { productId: p.productId } })}
        selection={canManage ? { selected, onChange: setSelected, label: (p) => p.name } : undefined}
        empty={{ icon: PackageSearch, title: "No products here", description: "Products appear here as shops add them." }}
        above={
          <>
            {result ? <BulkResult result={result} names={names} onDismiss={() => setResult(null)} /> : null}
            {canManage && chosen.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2" role="region" aria-label="Selected products">
                <span className="text-sm font-medium">{chosen.length} selected</span>
                <Button size="sm" variant="outline" onClick={() => start("margin", chosen)}>
                  Set margin
                </Button>
                <Button size="sm" variant="outline" onClick={() => start("hold", chosen.filter((p) => p.state !== "held"))}>
                  Hold
                </Button>
                <Button size="sm" variant="outline" onClick={() => start("release", chosen.filter((p) => p.state === "held"))}>
                  Release
                </Button>
                <ToolbarSpacer />
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            ) : null}
          </>
        }
        toolbar={
          <>
            <ViewSelect
              label="Product states"
              value={tab}
              onChange={(v) => state.setFilter("state", v === "all" ? undefined : v)}
              options={BACKOFFICE_PRODUCT_TABS.map((t) => ({
                value: t,
                label: BACKOFFICE_PRODUCT_STATE_WORDS[t],
                count: query.data?.counts[t],
                attention: t === "held",
              }))}
            />
            <Facet
              label="Shop"
              anyLabel="All shops"
              value={f.shopId ?? null}
              onChange={(v) => state.setFilter("shopId", v ?? undefined)}
              options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
            <Facet label="Aisle" anyLabel="Every aisle" value={f.categoryId ?? null} onChange={(v) => state.setFilter("categoryId", v ?? undefined)} options={aisles} />
            <Facet
              label="Storage"
              value={f.storage ?? null}
              onChange={(v) => state.setFilter("storage", v ?? undefined)}
              options={STORAGES.map((s) => ({ value: s, label: STORAGE_WORDS[s] }))}
            />
            <Facet
              label="Margin"
              value={f.margin ?? null}
              onChange={(v) => state.setFilter("margin", v ?? undefined)}
              options={[
                { value: "set" as const, label: "Set" },
                { value: "not_set" as const, label: "Not set" },
              ]}
            />
            <Facet
              label="Needs attention"
              anyLabel="Anything"
              value={f.lowStock ? "low" : f.missingDetails ? "missing" : null}
              onChange={(v) => state.setFilters({ lowStock: v === "low" ? true : undefined, missingDetails: v === "missing" ? true : undefined })}
              options={[
                { value: "low" as const, label: "Low stock" },
                { value: "missing" as const, label: "Missing details" },
              ]}
            />
            {isFiltered(state.view, ["state"]) ? <ResetFilters onReset={state.reset} /> : null}
            <SearchBox label="Search products" placeholder="Name, SKU or barcode" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
    </ListPage>
  )
}

function ProductCell({ p }: { p: Row }) {
  return (
    <div className="flex items-center gap-3">
      {p.imageUrl ? (
        <img src={p.imageUrl} alt="" className="size-10 shrink-0 rounded-md border object-cover" loading="lazy" />
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-md border text-muted-foreground" aria-hidden="true">
          <ImageOff className="size-4" />
        </span>
      )}
      <div className="min-w-0">
        <span className="block max-w-[36ch] truncate">{p.name}</span>
        <span className="mt-0.5 block truncate text-sm font-normal text-muted-foreground">
          {[p.brand, p.origin !== "shop" ? PRODUCT_ORIGIN_WORDS[p.origin] : null].filter(Boolean).join(" · ")}
          <span className="md:hidden">
            {p.brand || p.origin !== "shop" ? " · " : ""}
            {p.shop.name}
          </span>
        </span>
      </div>
    </div>
  )
}
