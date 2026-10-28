import { useQuery } from "@tanstack/react-query"

import type { StockMovementDTO } from "@effy/shared-types"
import { Minus, Plus } from "lucide-react"

import { Skeleton } from "@effy/design-system/ui"
import { DetailRows, ResponsiveSheet, Timeline, TimelineItem } from "@effy/web-kit/patterns"

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
        <h3 className="text-xs font-medium text-muted-foreground">Summary</h3>
        <DetailRows
          tight
          rows={[
            { label: "Status", value: <ProductStatusBadge status={detail.status} /> },
            { label: "Sections", value: <span className="tabular-nums">{detail.sections.length}</span> },
            { label: "Images", value: <span className="tabular-nums">{detail.media.length}</span> },
            {
              label: "Updated",
              value: new Date(detail.updatedAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            },
          ]}
        />
      </section>

      <section className="grid gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Change log</h3>
        {stock.isPending ? (
          <div className="grid gap-3" aria-busy="true" aria-label="Loading change log">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : stock.isError ? (
          <p className="text-sm text-muted-foreground">The change log couldn&apos;t be loaded.</p>
        ) : stock.data.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No changes recorded yet. Every change to the stock count appears here, with who made it.
          </p>
        ) : (
          <Timeline>
            {stock.data.movements.map((m) => (
              <ChangeLogEntry key={m.id} movement={m} />
            ))}
          </Timeline>
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
    <TimelineItem
      icon={down ? <Minus /> : <Plus />}
      tone={down ? "problem" : "default"}
      title={stockChangeTitle(movement)}
    >
      {who && who !== "—" ? `${when} · ${who}` : when}
    </TimelineItem>
  )
}
