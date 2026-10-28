import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import type { ProductStatus, ShopReviewState } from "@effy/shared-types"
import { Boxes, CircleAlert, Hourglass, ImageOff, Package, Plus, Tags, ToggleRight } from "lucide-react"

import { Badge, Button, Input, TabsCount } from "@effy/design-system/ui"
import {
  DataTable,
  defineListSearch,
  Facet,
  isFiltered,
  ListPage,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  searchFilter,
  useListState,
  ViewSelect,
  type ClientFilterParser,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { MoreActions, PageHeader } from "@effy/web-kit/patterns"

import { cn } from "@/lib/utils"

import { ProductStatusBadge } from "./components/ProductStatusBadge"
import { SectionsManager } from "./SectionsManager"
import { StockSettingsDialog } from "./ShopDefaultThreshold"
import type { ProductListItem } from "./model"
import { REVIEW_FILTERS, reviewChip } from "./review"
import { PRODUCTS_ROOT, productListQuery, sectionsQuery, taxonomyQuery } from "./queries"
import { fetchProductPage } from "./repo"

const STATUSES = ["active", "draft", "unavailable", "archived"] as const satisfies readonly ProductStatus[]
type StatusView = "all" | ProductStatus
const STATUS_LABEL: Record<StatusView, string> = {
  all: "All",
  active: "Live",
  draft: "Drafts",
  unavailable: "Unavailable",
  archived: "Archived",
}

const moneyText: ClientFilterParser<string> = (raw) =>
  typeof raw === "string" && /^\d+(\.\d{1,2})?$/.test(raw.trim()) ? raw.trim() : undefined

/** The catalogue's view in the address (103), mirroring the shop service's `SHOP_PRODUCT_LIST_SPEC`. */
export const catalogList = defineListSearch({
  id: "catalog",
  mode: "offset",
  sorts: ["recent", "name", "price"] as const,
  defaultSort: "recent",
  sortDir: { recent: "desc", name: "asc", price: "asc" },
  filters: {
    status: searchFilter.oneOf(STATUSES),
    category: searchFilter.uuid,
    section: searchFilter.uuid,
    reviewState: searchFilter.oneOf(REVIEW_FILTERS.map((f) => f.value) as ShopReviewState[]),
    missing: searchFilter.flag,
    priceMin: moneyText,
    priceMax: moneyText,
  },
})

const money = (amount: string, currency: string) => {
  const n = Number(amount)
  return Number.isFinite(n) ? new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n) : "—"
}

const columns: EffyColumnDef<ProductListItem>[] = [
  {
    id: "product",
    header: "Product",
    cell: ({ row }) => <ProductCell product={row.original} />,
    meta: { label: "Product", identifying: true, phone: "primary", sortKey: "name" },
  },
  {
    id: "sizes",
    header: "Sizes",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.variantCount === 1 ? "One size" : `${row.original.variantCount} sizes`}</span>
    ),
    meta: { label: "Sizes", priority: 2, phone: "hide" },
  },
  {
    id: "category",
    header: "Category",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.categoryName}
        {row.original.missingRequired > 0 ? (
          <span className="mt-1 flex items-center gap-1 text-xs font-medium text-foreground">
            <CircleAlert aria-hidden="true" className="size-3.5" />
            {row.original.missingRequired === 1 ? "1 detail missing" : `${row.original.missingRequired} details missing`}
          </span>
        ) : null}
      </span>
    ),
    meta: { label: "Category", priority: 2 },
  },
  { id: "status", header: "Status", cell: ({ row }) => <StatusCell product={row.original} />, meta: { label: "Status", phone: "badge" } },
  {
    id: "storefront",
    header: "On the storefront",
    cell: ({ row }) => {
      const available = row.original.status === "active"
      return (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span aria-hidden="true" className={cn("inline-block size-2 rounded-full", available ? "bg-success" : "bg-input")} />
          {available ? "Buyable" : "Not buyable"}
        </span>
      )
    },
    meta: { label: "On the storefront" },
  },
  {
    id: "price",
    header: "Your price",
    cell: ({ row }) => (
      <span className="font-semibold">
        {row.original.priceVaries ? "From " : ""}
        {money(row.original.shopPriceAmount ?? row.original.priceAmount, row.original.currency)}
      </span>
    ),
    meta: { label: "Your price", align: "numeric", sortKey: "price", phone: "trail" },
  },
]

export function CatalogListScreen() {
  const taxonomy = useQuery(taxonomyQuery)
  const sections = useQuery(sectionsQuery)
  const state = useListState(catalogList, useSearch({ strict: false }))
  const f = state.view.filters
  const input = { key: PRODUCTS_ROOT, list: catalogList, view: state.view, fetch: fetchProductPage }
  const query = useQuery(listQueryOptions(input))
  const [sectionsOpen, setSectionsOpen] = useState(false)
  const [stockSettingsOpen, setStockSettingsOpen] = useState(false)

  // Departments: the filter takes everything filed beneath one.
  const departments = (taxonomy.data?.categories ?? []).filter((c) => c.parentId === null)
  // How many products lack a required detail Effy added after they went on sale.
  const missingCount = useQuery(productListQuery({ page: 1, pageSize: 25, missing: true })).data?.total ?? 0
  const status: StatusView = f.status ?? "all"

  return (
    <ListPage
      header={
        <PageHeader
          title="Catalog"
          description="Your shop's products, prices and stock; new products and price changes need Effy's approval."
          actions={
            <>
              <Button asChild variant="outline">
                <Link to="/catalog/availability">
                  <ToggleRight aria-hidden="true" />
                  Availability
                </Link>
              </Button>
              <Button asChild>
                <Link to="/catalog/new">
                  <Plus aria-hidden="true" />
                  New product
                </Link>
              </Button>
              <MoreActions
                actions={[
                  { label: "Manage sections", icon: Tags, onSelect: () => setSectionsOpen(true) },
                  { label: "Stock settings", icon: Boxes, onSelect: () => setStockSettingsOpen(true) },
                ]}
              />
            </>
          }
        />
      }
    >
      <DataTable
        app="shop-web"
        label="Products"
        list={catalogList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        viewFilters={["status"]}
        rowHref={(p) => ({ to: "/catalog/$productId", params: { productId: p.id } })}
        empty={{
          icon: Package,
          title: "No products yet",
          description: "Add your first product to get started. Effy reviews it before customers see it.",
          action: (
            <Button asChild>
              <Link to="/catalog/new">
                <Plus aria-hidden="true" />
                New product
              </Link>
            </Button>
          ),
        }}
        toolbar={
          <>
            <ViewSelect
              label="Filter by status"
              value={status}
              onChange={(v) => state.setFilter("status", v === "all" ? undefined : v)}
              options={(["all", ...STATUSES] as const).map((v) => ({ value: v, label: STATUS_LABEL[v] }))}
            />
            <Facet
              label="Category"
              value={f.category ?? null}
              options={departments.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) => state.setFilter("category", v ?? undefined)}
              anyLabel="All categories"
            />
            <Facet
              label="Section"
              value={f.section ?? null}
              options={(sections.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
              onChange={(v) => state.setFilter("section", v ?? undefined)}
              anyLabel="All sections"
            />
            {missingCount > 0 || f.missing ? (
              <Button
                type="button"
                variant={f.missing ? "secondary" : "outline"}
                aria-pressed={Boolean(f.missing)}
                onClick={() => state.setFilter("missing", f.missing ? undefined : true)}
              >
                <CircleAlert aria-hidden="true" />
                Missing details
                <TabsCount tone="primary">{missingCount}</TabsCount>
              </Button>
            ) : null}
            <Facet
              label="Review"
              value={f.reviewState ?? null}
              options={REVIEW_FILTERS.map((r) => ({ value: r.value, label: r.label }))}
              onChange={(v) => state.setFilter("reviewState", v ?? undefined)}
              anyLabel="Any review state"
            />
            <PriceRange
              min={f.priceMin}
              max={f.priceMax}
              onChange={(r) => state.setFilters({ priceMin: r.min, priceMax: r.max })}
            />
            {isFiltered(state.view, ["status"]) ? <ResetFilters onReset={state.reset} /> : null}
            <SearchBox label="Search products" placeholder="Name, brand, SKU or barcode…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />

      <SectionsManager open={sectionsOpen} onOpenChange={setSectionsOpen} />
      <StockSettingsDialog open={stockSettingsOpen} onOpenChange={setStockSettingsOpen} />
    </ListPage>
  )
}

/** Two amounts that apply when a field is left (or Enter is pressed), so typing does not page the list. */
function PriceRange({ min, max, onChange }: { min?: string; max?: string; onChange: (r: { min?: string; max?: string }) => void }) {
  const [draft, setDraft] = useState({ min: min ?? "", max: max ?? "" })
  const apply = () => onChange({ min: draft.min.trim() || undefined, max: draft.max.trim() || undefined })
  const field = (key: "min" | "max", label: string, placeholder: string) => (
    <Input
      aria-label={label}
      placeholder={placeholder}
      inputMode="decimal"
      value={draft[key]}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") apply()
      }}
      className="w-24"
    />
  )
  return (
    <div className="flex items-center gap-2">
      {field("min", "Minimum price", "Min $")}
      <span aria-hidden="true" className="text-muted-foreground">
        –
      </span>
      {field("max", "Maximum price", "Max $")}
    </div>
  )
}

function ProductCell({ product }: { product: ProductListItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {product.primaryImageUrl ? (
        <img src={product.primaryImageUrl} alt="" className="size-10 shrink-0 rounded-lg border object-cover" />
      ) : (
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <ImageOff aria-hidden="true" className="size-4" />
        </div>
      )}
      <div className="min-w-0">
        <span className="block max-w-[36ch] truncate">{product.name}</span>
        {product.brand ? <span className="mt-0.5 block truncate font-normal text-muted-foreground">{product.brand}</span> : null}
      </div>
    </div>
  )
}

function StatusCell({ product }: { product: ProductListItem }) {
  const chip = reviewChip(product.reviewState)
  const sentBack = product.reviewState === "sent_back" || product.reviewState === "live_change_sent_back"
  return (
    <div className="flex flex-wrap items-center gap-2">
      {product.hold ? <Badge variant="destructive">Held by Effy</Badge> : <ProductStatusBadge status={product.status} />}
      {product.createdBy === "effy" ? <Badge variant="muted">Added by Effy</Badge> : null}
      {chip ? (
        <Badge variant={sentBack ? "destructive" : "default"}>
          {sentBack ? <CircleAlert aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
          {chip.label}
        </Badge>
      ) : null}
    </div>
  )
}
