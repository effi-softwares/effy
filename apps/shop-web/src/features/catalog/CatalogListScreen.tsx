import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import type { ProductStatus, ShopReviewState } from "@effy/shared-types"
import {
  ArrowUpDown,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Hourglass,
  ImageOff,
  Package,
  Plus,
  Search,
  SearchX,
  Tags,
  ToggleRight,
  X,
} from "lucide-react"

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
  Skeleton,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { Facet, PageHeader, ToolbarSpacer } from "@effy/web-kit/patterns"

import { Page, TableFrame, Td, Th, Tr } from "@/components/console/primitives"
import { cn } from "@/lib/utils"
import { track } from "@/lib/telemetry"

import { ProductStatusBadge } from "./components/ProductStatusBadge"
import { SectionsManager } from "./SectionsManager"
import { StockSettingsDialog } from "./ShopDefaultThreshold"
import type { ProductListItem, ProductListParams, ProductSort } from "./model"
import { REVIEW_FILTERS, reviewChip } from "./review"
import { catalogSchemaQuery, productListQuery, sectionsQuery } from "./queries"

const PAGE_SIZE = 20
const ALL = "all"

const STATUS_TABS: readonly { value: ProductStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: "All" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "unavailable", label: "Unavailable" },
  { value: "archived", label: "Archived" },
]

export function CatalogListScreen() {
  const schema = useQuery(catalogSchemaQuery)
  const sections = useQuery(sectionsQuery)

  const [page, setPage] = useState(1)
  const [q, setQ] = useState("")
  const [type, setType] = useState<string>(ALL)
  const [category, setCategory] = useState<string>(ALL)
  const [section, setSection] = useState<string>(ALL)
  const [status, setStatus] = useState<ProductStatus | typeof ALL>(ALL)
  const [review, setReview] = useState<ShopReviewState | typeof ALL>(ALL)
  const [priceMin, setPriceMin] = useState("")
  const [priceMax, setPriceMax] = useState("")
  const [sort, setSort] = useState<ProductSort>("recent")
  const [sectionsOpen, setSectionsOpen] = useState(false)
  const [stockSettingsOpen, setStockSettingsOpen] = useState(false)

  const params: ProductListParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      q: q.trim() || undefined,
      type: type === ALL ? undefined : type,
      category: category === ALL ? undefined : category,
      section: section === ALL ? undefined : section,
      status: status === ALL ? undefined : status,
      reviewState: review === ALL ? undefined : review,
      priceMin: priceMin.trim() || undefined,
      priceMax: priceMax.trim() || undefined,
      sort,
      order: sort === "recent" ? "desc" : "asc",
    }),
    [page, q, type, category, section, status, review, priceMin, priceMax, sort],
  )

  const { data, error, isPending, isError, refetch } = useQuery(productListQuery(params))
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const types = schema.data?.productTypes ?? []
  const categories = schema.data?.categories ?? []
  const sectionList = sections.data ?? []

  function onSearch(value: string) {
    setQ(value)
    setPage(1)
    track({ name: "catalog_search" })
  }
  function onFilter<T>(setter: (v: T) => void, value: T) {
    setter(value)
    setPage(1)
    track({ name: "catalog_filter_applied" })
  }

  const activeFilters = [
    q.trim() ? { key: "q", label: `"${q.trim()}"`, clear: () => onSearch("") } : null,
    type !== ALL
      ? {
          key: "type",
          label: types.find((t) => t.id === type)?.name ?? "Type",
          clear: () => onFilter(setType, ALL),
        }
      : null,
    category !== ALL
      ? {
          key: "category",
          label: categories.find((c) => c.id === category)?.name ?? "Category",
          clear: () => onFilter(setCategory, ALL),
        }
      : null,
    section !== ALL
      ? {
          key: "section",
          label: sectionList.find((x) => x.id === section)?.name ?? "Section",
          clear: () => onFilter(setSection, ALL),
        }
      : null,
    review !== ALL
      ? {
          key: "review",
          label: REVIEW_FILTERS.find((f) => f.value === review)?.label ?? "review",
          clear: () => onFilter(setReview, ALL),
        }
      : null,
    priceMin.trim() ? { key: "min", label: `min ${priceMin}`, clear: () => onFilter(setPriceMin, "") } : null,
    priceMax.trim() ? { key: "max", label: `max ${priceMax}`, clear: () => onFilter(setPriceMax, "") } : null,
  ].filter((f): f is { key: string; label: string; clear: () => void } => f !== null)

  const hasFilters = activeFilters.length > 0 || status !== ALL
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? (data.page - 1) * data.pageSize + data.items.length : 0

  return (
    <Page>
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
            <Button variant="outline" onClick={() => setSectionsOpen(true)}>
              <Tags aria-hidden="true" />
              Manage sections
            </Button>
            <Button variant="outline" onClick={() => setStockSettingsOpen(true)}>
              <Boxes aria-hidden="true" />
              Stock settings
            </Button>
            <Button asChild>
              <Link to="/catalog/new">
                <Plus aria-hidden="true" />
                New product
              </Link>
            </Button>
          </>
        }
      />

      <div role="tablist" aria-label="Filter by status" className="ef-tabs">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={t.value === status}
            onClick={() => onFilter(setStatus, t.value)}
            className={cn("ef-tabs__tab", t.value === status && "is-active")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ef-toolbar">
        <label className="ef-toolbar__search">
          <Search aria-hidden="true" />
          <Input
            aria-label="Search products"
            type="search"
            placeholder="Name, brand, SKU or barcode…"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
        <Facet
          label="Category"
          value={category === ALL ? null : category}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => onFilter(setCategory, v ?? ALL)}
          anyLabel="All categories"
        />
        <Facet
          label="Section"
          value={section === ALL ? null : section}
          options={sectionList.map((x) => ({ value: x.id, label: x.name }))}
          onChange={(v) => onFilter(setSection, v ?? ALL)}
          anyLabel="All sections"
        />
        <Facet
          label="Type"
          value={type === ALL ? null : type}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => onFilter(setType, v ?? ALL)}
          anyLabel="All types"
        />
        <Facet
          label="Review"
          value={review === ALL ? null : review}
          options={REVIEW_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          onChange={(v) => onFilter(setReview, (v ?? ALL) as ShopReviewState | typeof ALL)}
          anyLabel="Any review state"
        />
        <div className="flex items-center gap-1.5">
          <Input
            aria-label="Minimum price"
            placeholder="Min $"
            inputMode="decimal"
            value={priceMin}
            onChange={(e) => onFilter(setPriceMin, e.target.value)}
            className="w-24"
          />
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <Input
            aria-label="Maximum price"
            placeholder="Max $"
            inputMode="decimal"
            value={priceMax}
            onChange={(e) => onFilter(setPriceMax, e.target.value)}
            className="w-24"
          />
        </div>
        <ToolbarSpacer />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label="Sort">
              <ArrowUpDown aria-hidden="true" />
              {SORT_LABEL[sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onFilter(setSort, v as ProductSort)}>
              {(Object.keys(SORT_LABEL) as ProductSort[]).map((k) => (
                <DropdownMenuRadioItem key={k} value={k}>
                  {SORT_LABEL[k]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {activeFilters.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <span className="text-sm whitespace-nowrap text-muted-foreground">Filtered by</span>
          {activeFilters.map((f) => (
            <Button
              key={f.key}
              type="button"
              variant="secondary"
              size="sm"
              onClick={f.clear}
              aria-label={`Remove filter ${f.label}`}
            >
              {f.label}
              <X aria-hidden="true" />
            </Button>
          ))}
        </div>
      ) : null}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <CatalogLoading />
      ) : data.items.length === 0 ? (
        <div className="ef-empty">
          <span className="ef-empty__icon" aria-hidden="true">
            {hasFilters ? <SearchX /> : <Package />}
          </span>
          <h3>{hasFilters ? "No products match your filter" : "No products yet"}</h3>
          <p>
            {hasFilters
              ? "Clear a filter, or search for something else."
              : "Add your first product to get started. Effy reviews it before customers see it."}
          </p>
          <Button asChild className="mt-2">
            <Link to="/catalog/new">
              <Plus aria-hidden="true" />
              New product
            </Link>
          </Button>
        </div>
      ) : (
        <TableFrame>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Sizes</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              <Th>On the storefront</Th>
              <Th align="right">Your price</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="p-0!">
                <div className="ef-pager border-t-0">
                  <span className="tabular-nums">
                    {from}–{to} of {data.total} {data.total === 1 ? "product" : "products"} · page {data.page} of{" "}
                    {totalPages}
                  </span>
                  <div className="ef-pager__btns">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft aria-hidden="true" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </td>
            </tr>
          </tfoot>
        </TableFrame>
      )}

      <SectionsManager open={sectionsOpen} onOpenChange={setSectionsOpen} />
      <StockSettingsDialog open={stockSettingsOpen} onOpenChange={setStockSettingsOpen} />
    </Page>
  )
}

const SORT_LABEL: Record<ProductSort, string> = {
  recent: "Most recent",
  name: "Name",
  price: "Price",
}

const money = (amount: string, currency: string) => {
  const n = Number(amount)
  return Number.isFinite(n) ? new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(n) : "—"
}

function ProductRow({ product }: { product: ProductListItem }) {
  const navigate = useNavigate()
  const available = product.status === "active"
  const chip = reviewChip(product.reviewState)
  const sentBack = product.reviewState === "sent_back" || product.reviewState === "live_change_sent_back"
  const price = product.shopPriceAmount ?? product.priceAmount

  return (
    <Tr interactive onClick={() => void navigate({ to: "/catalog/$productId", params: { productId: product.id } })}>
      <Td>
        <div className="flex min-w-0 items-center gap-3">
          {product.primaryImageUrl ? (
            <img
              src={product.primaryImageUrl}
              alt=""
              className="size-12 shrink-0 rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="ef-img size-12 rounded-lg">
              <ImageOff aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <Link
              to="/catalog/$productId"
              params={{ productId: product.id }}
              onClick={(e) => e.stopPropagation()}
              className="block truncate font-medium text-foreground no-underline hover:underline"
            >
              {product.name}
            </Link>
            {product.brand ? <span className="ef-sub truncate">{product.brand}</span> : null}
          </div>
        </div>
      </Td>
      <Td className="whitespace-nowrap text-muted-foreground">
        {product.variantCount === 1 ? "One size" : `${product.variantCount} sizes`}
      </Td>
      <Td className="text-muted-foreground">{product.categoryName}</Td>
      <Td>
        <div className="flex flex-wrap items-center gap-1.5">
          <ProductStatusBadge status={product.status} />
          {chip ? (
            <span className={cn("ef-st", sentBack ? "ef-st--problem" : "ef-st--moving")}>
              {sentBack ? <CircleAlert aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
              {chip.label}
            </span>
          ) : null}
        </div>
      </Td>
      <Td>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span aria-hidden="true" className={cn("ef-dot", available ? "ef-dot--on" : "ef-dot--off")} />
          {available ? "Buyable" : "Not buyable"}
        </span>
      </Td>
      <Td align="right" className="font-semibold whitespace-nowrap tabular-nums">
        {product.priceVaries ? "From " : ""}
        {money(price, product.currency)}
      </Td>
    </Tr>
  )
}

function CatalogLoading() {
  return (
    <div className="ef-table-wrap" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0">
          <Skeleton className="size-12 rounded-lg" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
