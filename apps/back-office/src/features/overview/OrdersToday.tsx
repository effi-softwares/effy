import { useQuery } from "@tanstack/react-query"

import { Skeleton } from "@effy/design-system/ui"
import { DetailRows, Panel } from "@effy/web-kit/patterns"
import { ordersTodayQuery } from "@/features/orders/queries"
import { money } from "./overviewFormat"

export function OrdersToday() {
  const today = useQuery(ordersTodayQuery())
  const t = today.data
  return (
    <Panel title="Orders today" description="Placed since midnight, by who delivers them.">
      {today.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </div>
      ) : today.isError || !t ? (
        <p className="text-sm text-muted-foreground">
          Couldn't load today's figures. They come back when the orders service answers.
        </p>
      ) : (
        <DetailRows
          tight
          rows={[
            {
              label: "Delivered by Effy",
              value: <span className="tabular-nums">{plural(Number(t.effy), "order")}</span>,
            },
            {
              label: "Courier delivery",
              value: <span className="tabular-nums">{plural(Number(t.courier), "order")}</span>,
            },
            {
              label: "Refunded",
              value: (
                <span className="tabular-nums">
                  {plural(Number(t.refunded.orders), "order")}
                  {Number(t.refunded.orders) > 0 ? ` · ${money(t.refunded.amount, t.refunded.currency)}` : ""}
                </span>
              ),
            },
          ]}
        />
      )}
    </Panel>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
