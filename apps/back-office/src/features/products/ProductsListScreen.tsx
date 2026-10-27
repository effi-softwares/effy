import { useEffect, useMemo, useState } from "react"

import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ImageOff, PackageSearch, Plus, Upload } from "lucide-react"

import {
  BACKOFFICE_PRODUCT_STATE_WORDS,
  BACKOFFICE_PRODUCT_TABS,
  PRODUCT_ORIGIN_WORDS,
  STORAGE_WORDS,
  STORAGES,
  type BackOfficeProductRowDTO,
  type BackOfficeProductSort,
  type BackOfficeProductTab,
  type BulkProductsResultDTO,
} from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Button, Checkbox, Skeleton } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import {
  EmptyState,
  Facet,
  PageHeader,
  ResetFilters,
  SearchBox,
  StatusWord,
  Toolbar,
  ToolbarSpacer,
} from "@effy/web-kit/patterns"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { marginLabel } from "@/features/product-review/model"
import { shopListQuery } from "@/features/shops/queries"
import { pathText } from "@/features/taxonomy/model"
import { treeQuery } from "@/features/taxonomy/queries"
import { money, moment } from "@/lib/format"

import { canManageProducts } from "./access"
import { BulkDialog, BulkResult, type BulkAction, type Target } from "./BulkDialogs"
import { clearFilters, hasFilters, type ProductSearch } from "./model"
import { productListQuery } from "./queries"
import { STATE_TONE } from "./words"

const SORT_WORDS: Record<BackOfficeProductSort, string> = {
  updated: "Last changed",
  name: "Name",
  price: "Customer price",
  shop: "Shop",
}

/** Catalogue › Products: every product of every shop (102). The view lives in the URL. */
export function ProductsListScreen({ search }: { search: ProductSearch }) {
  const navigate = useNavigate()
  const canManage = canManageProducts(useSessionRoles())
  const list = useInfiniteQuery(productListQuery(search))
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 100 }))
  const tree = useQuery(treeQuery())

  const go = (next: ProductSearch) => void navigate({ to: "/products", search: next as never, replace: true })
  const set = (patch: Partial<ProductSearch>) => go({ ...search, ...patch })

  // The box answers as you type; the URL follows once typing pauses.
  const [q, setQ] = useState(search.q ?? "")
  useEffect(() => setQ(search.q ?? ""), [search.q])
  useEffect(() => {
    if (q === (search.q ?? "")) return
    const t = setTimeout(() => set({ q: q.trim() || undefined }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` is rebuilt every render; `q` is the trigger
  }, [q])

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

  const first = list.data?.pages[0]
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const tab: BackOfficeProductTab = search.state ?? "all"

  // Selection follows the view: a new search or filter starts it again.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const viewKey = JSON.stringify(search)
  useEffect(() => setSelected(new Set()), [viewKey])
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allShown = items.length > 0 && items.every((p) => selected.has(p.productId))

  const [action, setAction] = useState<{ kind: BulkAction; targets: Target[] } | null>(null)
  const [result, setResult] = useState<BulkProductsResultDTO | null>(null)
  const names = useMemo(() => new Map(items.map((p) => [p.productId, p.name])), [items])
  const targetsOf = (rows: readonly BackOfficeProductRowDTO[]): Target[] =>
    rows.map((p) => ({
      productId: p.productId,
      name: p.name,
      version: p.version,
      shopPriceFrom: p.shopPriceFrom,
      margin: p.margin,
    }))
  const start = (kind: BulkAction, rows: readonly BackOfficeProductRowDTO[]) => {
    setResult(null)
    setAction({ kind, targets: targetsOf(rows) })
  }
  const chosen = items.filter((p) => selected.has(p.productId))

  return (
    <>
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

      <div className="space-y-3">
        <nav className="ef-tabs" aria-label="Product states">
          {BACKOFFICE_PRODUCT_TABS.map((t) => (
            <button
              key={t}
              type="button"
              aria-current={t === tab ? "page" : undefined}
              className={cn("ef-tabs__tab", t === tab && "is-active")}
              onClick={() => set({ state: t === "all" ? undefined : t })}
            >
              {BACKOFFICE_PRODUCT_STATE_WORDS[t]}
              {first ? (
                <span
                  className={cn(
                    "ef-tabs__count",
                    t === "held" && first.counts.held > 0 && t !== tab && "ef-tabs__count--primary",
                  )}
                >
                  {first.counts[t]}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <Toolbar>
          <SearchBox label="Search products" placeholder="Name, SKU or barcode" value={q} onChange={setQ} />
          <Facet
            label="Shop"
            anyLabel="All shops"
            value={search.shopId ?? null}
            onChange={(v) => set({ shopId: v ?? undefined })}
            options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          <Facet
            label="Aisle"
            anyLabel="Every aisle"
            value={search.categoryId ?? null}
            onChange={(v) => set({ categoryId: v ?? undefined })}
            options={aisles}
          />
          <Facet
            label="Storage"
            value={search.storage ?? null}
            onChange={(v) => set({ storage: v ?? undefined })}
            options={STORAGES.map((s) => ({ value: s, label: STORAGE_WORDS[s] }))}
          />
          <Facet
            label="Margin"
            value={search.margin ?? null}
            onChange={(v) => set({ margin: v ?? undefined })}
            options={[
              { value: "set" as const, label: "Set" },
              { value: "not_set" as const, label: "Not set" },
            ]}
          />
          <Facet
            label="Needs attention"
            anyLabel="Anything"
            value={search.lowStock ? "low" : search.missingDetails ? "missing" : null}
            onChange={(v) =>
              set({ lowStock: v === "low" ? true : undefined, missingDetails: v === "missing" ? true : undefined })
            }
            options={[
              { value: "low" as const, label: "Low stock" },
              { value: "missing" as const, label: "Missing details" },
            ]}
          />
          {hasFilters(search) ? (
            <ResetFilters
              onReset={() => {
                setQ("")
                go(clearFilters(search))
              }}
            />
          ) : null}
          <ToolbarSpacer />
          <Facet
            label="Sort"
            anyLabel={SORT_WORDS.updated}
            value={search.sort ?? null}
            onChange={(v) => set({ sort: v ?? undefined, dir: undefined })}
            options={(["name", "price", "shop"] as const).map((s) => ({ value: s, label: SORT_WORDS[s] }))}
          />
        </Toolbar>
      </div>

      {result ? <BulkResult result={result} names={names} onDismiss={() => setResult(null)} /> : null}

      {canManage && chosen.length > 0 ? (
        <div
          className="ef-toolbar rounded-md border bg-muted/40 px-3 py-2"
          role="region"
          aria-label="Selected products"
        >
          <span className="text-sm font-medium">{chosen.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => start("margin", chosen)}>
            Set margin
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              start(
                "hold",
                chosen.filter((p) => p.state !== "held"),
              )
            }
          >
            Hold
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              start(
                "release",
                chosen.filter((p) => p.state === "held"),
              )
            }
          >
            Release
          </Button>
          <ToolbarSpacer />
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

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

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <div className="ef-table-wrap p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={hasFilters(search) ? "No product matches" : "No products here"}
          description={
            hasFilters(search) ? "Try fewer filters or a different search." : "Products appear here as shops add them."
          }
        />
      ) : (
        <div className="ef-table-wrap">
          <div className="ef-table-scroll">
            <table className="ef-table ef-rtable">
              <thead>
                <tr>
                  {canManage ? (
                    <th className="w-10">
                      <Checkbox
                        aria-label="Select every product shown"
                        checked={allShown}
                        onCheckedChange={(on) => setSelected(on ? new Set(items.map((p) => p.productId)) : new Set())}
                      />
                    </th>
                  ) : null}
                  <th>Product</th>
                  <th className="max-md:hidden">Shop</th>
                  <th className="max-lg:hidden">Aisle</th>
                  <th className="text-right max-lg:hidden">Sizes</th>
                  <th className="text-right max-md:hidden">Shop price</th>
                  <th className="text-right">Customers pay</th>
                  <th className="max-lg:hidden">Margin</th>
                  <th>State</th>
                  <th className="max-xl:hidden">Changed</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <ProductRow
                    key={p.productId}
                    p={p}
                    selection={canManage ? { on: selected.has(p.productId), toggle: () => toggle(p.productId) } : null}
                    onMargin={canManage ? () => start("margin", [p]) : null}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              {items.length} of {first?.counts[tab] ?? items.length} shown
            </span>
            {list.hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? "Loading…" : "Show more"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}

/** Approved, not archived: only these have a margin to set (a new product gets one at approval). */
const hasMarginToSet = (p: BackOfficeProductRowDTO) =>
  !["draft", "in_review", "archived"].includes(p.state) || p.effySettingUp

function ProductRow({
  p,
  selection,
  onMargin,
}: {
  p: BackOfficeProductRowDTO
  selection: { on: boolean; toggle: () => void } | null
  onMargin: (() => void) | null
}) {
  const from = (amount: string | null) => (amount === null ? "—" : `${p.priceVaries ? "From " : ""}${money(amount)}`)
  const marginText = p.margin ? marginLabel(p.margin) : "Not set"
  return (
    <tr aria-selected={selection?.on}>
      {selection ? (
        <td>
          <Checkbox aria-label={`Select ${p.name}`} checked={selection.on} onCheckedChange={selection.toggle} />
        </td>
      ) : null}
      <td data-m="primary">
        <div className="flex items-center gap-3">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt="" className="size-10 shrink-0 rounded-md border object-cover" loading="lazy" />
          ) : (
            <span
              className="grid size-10 shrink-0 place-items-center rounded-md border text-muted-foreground"
              aria-hidden="true"
            >
              <ImageOff className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <Link to="/products/$productId" params={{ productId: p.productId }} className="link">
              {p.name}
            </Link>
            <div className="ef-sub truncate">
              {[p.brand, p.origin !== "shop" ? PRODUCT_ORIGIN_WORDS[p.origin] : null].filter(Boolean).join(" · ")}
              <span className="md:hidden">
                {p.brand || p.origin !== "shop" ? " · " : ""}
                {p.shop.name}
              </span>
            </div>
          </div>
        </div>
      </td>
      <td data-m="meta" className="max-md:hidden">
        {p.shop.name}
        {p.shop.status !== "active" ? <div className="ef-sub">Shop {p.shop.status}</div> : null}
      </td>
      <td className="is-muted max-lg:hidden" title={pathText(p.categoryPath)}>
        {p.categoryPath.at(-1) ?? "—"}
      </td>
      <td className="text-right tabular-nums max-lg:hidden">{p.variantCount}</td>
      <td className="text-right tabular-nums max-md:hidden">{from(p.shopPriceFrom)}</td>
      <td className="text-right tabular-nums">{from(p.customerPriceFrom)}</td>
      <td className="max-lg:hidden">
        {onMargin && hasMarginToSet(p) ? (
          <button type="button" className={cn("link", !p.margin && "text-muted-foreground")} onClick={onMargin}>
            {marginText}
          </button>
        ) : (
          <span className={p.margin ? undefined : "text-muted-foreground"}>{marginText}</span>
        )}
      </td>
      <td data-m="badge">
        <div className="flex flex-wrap items-center gap-1">
          <StatusWord tone={STATE_TONE[p.state]}>{BACKOFFICE_PRODUCT_STATE_WORDS[p.state]}</StatusWord>
          {p.effySettingUp ? <StatusWord tone="info">Effy setting up</StatusWord> : null}
          {p.lowStock ? <StatusWord tone="waiting">Low stock</StatusWord> : null}
          {p.missingRequired > 0 ? <StatusWord tone="waiting">Missing details</StatusWord> : null}
        </div>
      </td>
      <td className="is-muted whitespace-nowrap max-xl:hidden">{moment(p.updatedAt)}</td>
    </tr>
  )
}
