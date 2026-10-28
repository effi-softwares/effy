import { useEffect, useState } from "react"
import { useDebouncedValue } from "@effy/web-kit"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowDown, CircleAlert, CircleSlash, ImageOff, SearchX, ToggleRight } from "lucide-react"

import type { AvailabilityFilter, ShopAvailabilityDTO, ShopAvailabilityRowDTO } from "@effy/shared-types"
import { Badge, Button, Label, Skeleton, Switch, toast } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { EmptyState, PageHeader, SearchBox, ViewSelect } from "@effy/web-kit/patterns"

import { Page } from "@/components/console/primitives"
import { track } from "@/lib/telemetry"
import { cn } from "@/lib/utils"

import { availabilityQuery, useToggleSale } from "./availability"
import { productMutationError } from "./errorText"

const VIEWS: readonly { key: AvailabilityFilter; label: string; count: keyof ShopAvailabilityDTO["counts"] }[] = [
  { key: "needs_look", label: "Needs a look", count: "needsLook" },
  { key: "out_of_stock", label: "Out of stock", count: "outOfStock" },
  { key: "low_stock", label: "Low stock", count: "lowStock" },
  { key: "off_sale", label: "Off sale", count: "offSale" },
  { key: "all", label: "Everything", count: "all" },
]

export function AvailabilityScreen() {
  const [filter, setFilter] = useState<AvailabilityFilter>("needs_look")
  const [text, setText] = useState("")
  const q = useDebouncedValue(text.trim())
  const listKey = `${filter}|${q}`
  const [paging, setPaging] = useState<{ key: string; pages: string[] }>({ key: listKey, pages: [] })
  const pages = paging.key === listKey ? paging.pages : []
  const setPages = (next: string[]) => setPaging({ key: listKey, pages: next })
  useEffect(() => track({ name: "availability_viewed" }), [])

  const after = pages.at(-1)
  const { data, error, isError, isPending, refetch, isPlaceholderData } = useQuery(
    availabilityQuery({ q, filter, after }),
  )

  return (
    <Page>
      <PageHeader
        back={{ label: "Catalog", link: { to: "/catalog" } }}
        title="Availability"
        description="Switch products off sale instantly when you run out, with no review needed."
      />

      <div className="flex flex-wrap items-center gap-2">
        <ViewSelect
          label="Show"
          value={filter}
          onChange={setFilter}
          options={VIEWS.map((v) => ({
            value: v.key,
            label: v.label,
            count: data?.counts[v.count],
            attention: v.key === "out_of_stock",
          }))}
        />
        <SearchBox label="Search sizes" placeholder="Product, size or barcode…" value={text} onChange={setText} />
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="overflow-hidden rounded-xl border bg-card" aria-busy="true" aria-label="Loading sizes">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
              <Skeleton className="size-12 rounded-lg" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-7 w-12 rounded-full" />
            </div>
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={q ? SearchX : ToggleRight}
          title={q ? "No sizes match that search" : filter === "needs_look" ? "Nothing needs a look" : "No sizes here"}
          description={
            q
              ? "Try the product's name, the size, its code or its barcode."
              : filter === "needs_look"
                ? "No size is out of stock or running low. Sizes appear here the moment they do."
                : "Sizes of your live and unavailable products are listed here."
          }
        />
      ) : (
        <>
          <ul
            className={cn(
              "overflow-hidden rounded-xl border bg-card transition-opacity",
              isPlaceholderData && "opacity-60",
            )}
          >
            {data.items.map((row) => (
              <SizeRow key={row.variantId} row={row} />
            ))}
          </ul>
          {pages.length > 0 || data.next ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pages.length === 0}
                onClick={() => setPages(pages.slice(0, -1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.next}
                onClick={() => data.next && setPages([...pages, data.next])}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      <p className="text-sm text-muted-foreground">
        A size with 0 in stock already can&apos;t be bought while its stock is counted. Switch it off when the count is
        wrong or you can&apos;t sell it today.
      </p>
    </Page>
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

function SizeRow({ row }: { row: ShopAvailabilityRowDTO }) {
  const toggle = useToggleSale()
  const name = row.label ? `${row.productName} · ${row.label}` : row.productName
  const count = row.stock.tracked ? `${row.stock.onHand ?? 0} in stock` : "Not counted"
  return (
    <li className="flex min-h-18 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 text-sm last:border-b-0 max-md:px-3">
      {row.imageUrl ? (
        <img src={row.imageUrl} alt="" className="size-12 shrink-0 rounded-lg border object-cover" />
      ) : (
        <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <ImageOff aria-hidden="true" className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Link
          to="/catalog/$productId"
          params={{ productId: row.productId }}
          search={{ size: row.variantId }}
          className="font-medium text-foreground no-underline hover:underline"
        >
          {row.productName}
          {row.label ? <span className="font-normal text-muted-foreground"> · {row.label}</span> : null}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <StockWord row={row} />
          <span className="tabular-nums">{count}</span>
          {row.sku ? <span className="font-mono">{row.sku}</span> : null}
          {row.lastOnSale ? <span>· The last size on sale — make the product unavailable instead</span> : null}
        </div>
      </div>
      <Label className="gap-3 font-normal">
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
    </li>
  )
}
