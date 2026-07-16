import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ImageOff, Plus, Tags } from "lucide-react";

import type { ProductStatus } from "@effy/shared-types";
import { PRODUCT_STATUSES } from "@effy/shared-types";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { ProductCreateFlow } from "./ProductCreateFlow";
import { SectionsManager } from "./SectionsManager";
import { ProductStatusBadge } from "./components/ProductStatusBadge";
import type { ProductListItem, ProductListParams, ProductSort } from "./model";
import { catalogSchemaQuery, productListQuery, sectionsQuery } from "./queries";

const PAGE_SIZE = 20;
const ALL = "all";

const SORTS: { value: ProductSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "name", label: "Name" },
  { value: "price", label: "Price" },
];

function formatMoney(amount: string, currency: string): string {
  return `${currency} ${amount}`;
}

const columns: ColumnDef<ProductListItem>[] = [
  {
    id: "image",
    header: "",
    cell: ({ row }) =>
      row.original.primaryImageUrl ? (
        <img
          src={row.original.primaryImageUrl}
          alt=""
          className="h-10 w-10 rounded-md border object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-md border text-muted-foreground">
          <ImageOff className="size-4" />
        </div>
      ),
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link
          to="/catalog/$productId"
          params={{ productId: row.original.id }}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
        {row.original.brand ? (
          <div className="text-xs text-muted-foreground">{row.original.brand}</div>
        ) : null}
      </div>
    ),
  },
  { accessorKey: "typeName", header: "Type" },
  { accessorKey: "categoryName", header: "Category" },
  {
    accessorKey: "priceAmount",
    header: "Price",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatMoney(row.original.priceAmount, row.original.currency)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <ProductStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "sku",
    header: "SKU",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.sku ?? "—"}</span>
    ),
  },
];

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
  const [createOpen, setCreateOpen] = useState(false);
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

  // Reset to page 1 whenever a filter/search changes — page N of the old result set is meaningless.
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Catalog</h1>
          <p className="text-muted-foreground">Your shop's products.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setSectionsOpen(true)}>
            <Tags />
            Manage sections
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Add product
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search name, SKU, brand…"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={type} onValueChange={(v) => onFilter(setType, v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => onFilter(setCategory, v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={section} onValueChange={(v) => onFilter(setSection, v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sections</SelectItem>
            {sectionList.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => onFilter(setStatus, v as ProductStatus | typeof ALL)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {PRODUCT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Min $"
          inputMode="decimal"
          value={priceMin}
          onChange={(e) => onFilter(setPriceMin, e.target.value)}
          className="w-24"
        />
        <Input
          placeholder="Max $"
          inputMode="decimal"
          value={priceMax}
          onChange={(e) => onFilter(setPriceMax, e.target.value)}
          className="w-24"
        />
        <Select value={sort} onValueChange={(v) => onFilter(setSort, v as ProductSort)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data.items}
            emptyMessage="No products match your filter. Add your first product to get started."
          />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {data.total} product{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <ProductCreateFlow open={createOpen} onOpenChange={setCreateOpen} />
      <SectionsManager open={sectionsOpen} onOpenChange={setSectionsOpen} />
    </div>
  );
}
