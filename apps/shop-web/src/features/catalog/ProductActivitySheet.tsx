import { useQuery } from "@tanstack/react-query"

import type { StockMovementDTO } from "@effy/shared-types"
import { Minus, Plus } from "lucide-react"

import { Skeleton } from "@effy/design-system/ui"
import { ResponsiveSheet } from "@effy/web-kit/patterns"

import { cn } from "@/lib/utils"

import { ProductStatusBadge } from "./components/ProductStatusBadge"

import type { ProductDetail } from "./model"
import { actorLabel, stockChangeTitle } from "./stockMovementText"
import { variantStockQuery } from "./stockQueries"

export function ProductActivitySheet({
  detail,
  variantId,
  open,
  onOpenChange,
}: {
  detail: ProductDetail
  variantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const stock = useQuery(variantStockQuery(variantId))

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Activity"
      description="Where this product stands, and every change made to its stock."
    >
      <section className="grid gap-2">
        <h3 className="bo-eyebrow">Summary</h3>
        <dl className="bo-dl bo-dl--tight">
          <div className="bo-dl__row">
            <dt>Status</dt>
            <dd>
              <ProductStatusBadge status={detail.status} />
            </dd>
          </div>
          <div className="bo-dl__row">
            <dt>Sections</dt>
            <dd className="tabular-nums">{detail.sections.length}</dd>
          </div>
          <div className="bo-dl__row">
            <dt>Images</dt>
            <dd className="tabular-nums">{detail.media.length}</dd>
          </div>
          <div className="bo-dl__row">
            <dt>Updated</dt>
            <dd>
              {new Date(detail.updatedAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-2">
        <h3 className="bo-eyebrow">Change log</h3>
        {stock.isPending ? (
          <div className="grid gap-3" aria-busy="true" aria-label="Loading change log">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : stock.isError ? (
          <p className="text-muted-foreground">The change log couldn&apos;t be loaded.</p>
        ) : stock.data.movements.length === 0 ? (
          <p className="text-muted-foreground">
            No changes recorded yet. Every change to the stock count appears here, with who made it.
          </p>
        ) : (
          <ol className="bo-tl">
            {stock.data.movements.map((m) => (
              <ChangeLogEntry key={m.id} movement={m} />
            ))}
          </ol>
        )}
      </section>
    </ResponsiveSheet>
  )
}

function ChangeLogEntry({ movement }: { movement: StockMovementDTO }) {
  const who = actorLabel(movement)
  const when = new Date(movement.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
  const down = movement.quantityDelta < 0
  return (
    <li className="bo-tl__item">
      <span aria-hidden="true" className={cn("bo-tl__mark", down && "bo-tl__mark--problem")}>
        {down ? <Minus /> : <Plus />}
      </span>
      <span className="min-w-0">
        <span className="bo-tl__title block">{stockChangeTitle(movement)}</span>
        <span className="bo-tl__body block">{who && who !== "—" ? `${when} · ${who}` : when}</span>
      </span>
    </li>
  )
}
