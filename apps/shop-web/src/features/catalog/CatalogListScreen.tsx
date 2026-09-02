import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ProductStatus } from "@effy/shared-types";
import { ImageOff, Plus, Search, Tags, X } from "lucide-react";

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import {
  MicroLabel,
  Page,
  Pill,
  Segmented,
  StockMeter,
  TableFrame,
  Td,
  Th,
  Tr,
} from "@/components/console/primitives";
import { track } from "@/lib/telemetry";

import { SectionsManager } from "./SectionsManager";
import type { ProductListItem, ProductListParams, ProductSort } from "./model";
import { catalogSchemaQuery, productListQuery, sectionsQuery } from "./queries";

const PAGE_SIZE = 20;
const ALL = "all";

/**
 * The catalog list, rebuilt to the imported design (057).
 *
 * ⚠ THE STATUS FILTER IS A SEGMENTED CONTROL, NOT A SELECT. The mockup leads with `catTabs` because
 * "what is live vs. what is a draft" is the question an operator opens this screen asking; burying it
 * as the fourth dropdown in a row of six makes it the hardest filter to reach. The remaining filters
 * stay as selects — they are refinements, not the primary axis.
 *
 * ⚠ SEARCH IS SERVER-SIDE HERE AND CLIENT-SIDE ON THE ORDER QUEUE, deliberately. The catalog is paged
 * and runs to thousands of rows, so filtering one page in the browser would silently search only what
 * is visible and report "no matches" for a product that exists. The queue is tens of rows and its
 * ordering is load-bearing, so it filters in place.
 */
const STATUS_TABS: readonly { value: ProductStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: "All" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "unavailable", label: "Unavailable" },
  { value: "archived", label: "Archived" },
];

/** ⚠ Monochrome. The mockup tints these; see `primitives.tsx` for why that cannot survive here. */
function statusPill(status: ProductStatus) {
  return status === "active" ? "outline" : "quiet";
}

export function CatalogListScreen() {
  const schema = useQuery(catalogSchemaQuery);
  const sections = useQuery(sectionsQuery);

  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [section, setSection] = useState<string>(ALL);
  const [status, setStatus] = useState<ProductStatus | typeof ALL>(ALL);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<ProductSort>("recent");
  const [sectionsOpen, setSectionsOpen] = useState(false);

  const params: ProductListParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      q: q.trim() || undefined,
      type: type === ALL ? undefined : type,
      category: category === ALL ? undefined : category,
      section: section === ALL ? undefined : section,
      status: status === ALL ? undefined : status,
      priceMin: priceMin.trim() || undefined,
      priceMax: priceMax.trim() || undefined,
      sort,
      order: sort === "recent" ? "desc" : "asc",
    }),
    [page, q, type, category, section, status, priceMin, priceMax, sort],
  );

  const { data, error, isPending, isError, refetch } = useQuery(productListQuery(params));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const types = schema.data?.productTypes ?? [];
  const categories = schema.data?.categories ?? [];
  const sectionList = sections.data ?? [];

  function onSearch(value: string) {
    setQ(value);
    setPage(1);
    track({ name: "catalog_search" });
  }
  function onFilter<T>(setter: (v: T) => void, value: T) {
    setter(value);
    setPage(1);
    track({ name: "catalog_filter_applied" });
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
    priceMin.trim()
      ? { key: "min", label: `min ${priceMin}`, clear: () => onFilter(setPriceMin, "") }
      : null,
    priceMax.trim()
      ? { key: "max", label: `max ${priceMax}`, clear: () => onFilter(setPriceMax, "") }
      : null,
  ].filter((f): f is { key: string; label: string; clear: () => void } => f !== null);

  return (
    <Page>
      {/* The mockup's top row: the primary axis on the left, the create action on the right. */}
      <div className="flex flex-wrap items-center gap-4">
        <Segmented
          ariaLabel="Filter by status"
          value={status}
          onChange={(v) => onFilter(setStatus, v)}
          options={STATUS_TABS}
        />
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-8" onClick={() => setSectionsOpen(true)}>
          <Tags />
          Manage sections
        </Button>
        <Button asChild size="sm" className="h-8">
          <Link to="/catalog/new">
            <Plus />
            New product
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          />
          <Input
            aria-label="Search products"
            placeholder="Search name, SKU, brand…"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            className="h-8 w-64 pl-8 text-[13px]"
          />
        </div>

        <FilterSelect
          label="Type"
          value={type}
          onChange={(v) => onFilter(setType, v)}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          allLabel="All types"
        />
        <FilterSelect
          label="Category"
          value={category}
          onChange={(v) => onFilter(setCategory, v)}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          allLabel="All categories"
        />
        <FilterSelect
          label="Section"
          value={section}
          onChange={(v) => onFilter(setSection, v)}
          options={sectionList.map((s) => ({ value: s.id, label: s.name }))}
          allLabel="All sections"
        />

        <Input
          aria-label="Minimum price"
          placeholder="Min $"
          inputMode="decimal"
          value={priceMin}
          onChange={(e) => onFilter(setPriceMin, e.target.value)}
          className="h-8 w-20 text-[13px]"
        />
        <Input
          aria-label="Maximum price"
          placeholder="Max $"
          inputMode="decimal"
          value={priceMax}
          onChange={(e) => onFilter(setPriceMax, e.target.value)}
          className="h-8 w-20 text-[13px]"
        />

        <Select value={sort} onValueChange={(v) => onFilter(setSort, v as ProductSort)}>
          <SelectTrigger className="h-8 w-40 text-[13px]" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="price">Price</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <MicroLabel>Filtered by</MicroLabel>
          {activeFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={f.clear}
              aria-label={`Remove filter ${f.label}`}
              className="border-border hover:bg-accent focus-visible:ring-ring inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
            >
              {f.label}
              <X className="size-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <CatalogSkeleton />
      ) : (
        <>
          <TableFrame>
            <thead>
              <tr className="bg-muted">
                <Th>Product</Th>
                <Th width="15%">SKU</Th>
                <Th width="12%">Category</Th>
                <Th width="14%">Status</Th>
                <Th width="11%" align="right">
                  Price
                </Th>
                <Th width="16%" align="right">
                  Inventory
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr className="border-border border-t">
                  <td colSpan={6} className="text-muted-foreground px-3.5 py-10 text-center text-sm">
                    No products match your filter. Add your first product to get started.
                  </td>
                </tr>
              ) : (
                data.items.map((p) => <ProductRow key={p.id} product={p} />)
              )}
            </tbody>
          </TableFrame>

          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">
              <span className="tabular-nums">{data.total}</span> product
              {data.total === 1 ? "" : "s"} · page{" "}
              <span className="tabular-nums">{data.page}</span> of{" "}
              <span className="tabular-nums">{totalPages}</span>
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <SectionsManager open={sectionsOpen} onOpenChange={setSectionsOpen} />
    </Page>
  );
}

function ProductRow({ product }: { product: ProductListItem }) {
  // ⚠ THE LIST DTO CARRIES NO STOCK COUNT (054 keeps inventory off the catalog read), so the mockup's
  // per-row inventory meter has nothing to draw from here. Rather than invent a figure — which is the
  // "fixture agreed with the code instead of with the world" defect this codebase keeps recording —
  // the column states what IS known: whether the product is purchasable at all. The real meter lives
  // on the product's Inventory tab, where the count actually is.
  const available = product.status === "active";

  return (
    <Tr interactive>
      <Td>
        <div className="flex min-w-0 items-center gap-3">
          {product.primaryImageUrl ? (
            <img
              src={product.primaryImageUrl}
              alt=""
              className="border-border size-8 shrink-0 rounded-md border object-cover"
            />
          ) : (
            <div className="border-border text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md border">
              <ImageOff className="size-3.5" />
            </div>
          )}
          {/* ⚠ The mockup's Product cell is one line. The BRAND is kept as a muted second line
              anyway: it is the field an operator scans to tell two similar products apart, and the
              mockup's own sample data simply has no brands in it. Its TYPE column is genuinely gone —
              Category answers the same question for scanning, and the mockup drops it. */}
          <div className="min-w-0">
            <Link
              to="/catalog/$productId"
              params={{ productId: product.id }}
              className="block truncate font-medium hover:underline"
            >
              {product.name}
            </Link>
            {product.brand ? (
              <div className="text-muted-foreground truncate text-xs">{product.brand}</div>
            ) : null}
          </div>
        </div>
      </Td>
      <Td className="text-muted-foreground truncate font-mono text-[12.5px]">
        {product.sku ?? "—"}
      </Td>
      <Td className="text-muted-foreground text-[13px]">{product.categoryName}</Td>
      <Td>
        <Pill variant={statusPill(product.status)}>{product.status}</Pill>
      </Td>
      <Td align="right" className="font-medium tabular-nums">
        {product.currency} {product.priceAmount}
      </Td>
      <Td align="right">
        <StockMeter
          onHand={available ? 1 : 0}
          max={1}
          label={available ? "Buyable" : "Not buyable"}
          urgent={!available}
        />
      </Td>
    </Tr>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-36 text-[13px]" aria-label={`Filter by ${label.toLowerCase()}`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CatalogSkeleton() {
  return (
    <div className="border-border space-y-2 rounded-[var(--radius)] border p-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
