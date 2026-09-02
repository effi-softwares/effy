import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
import type { PurchaseOrderStatus } from "@effy/shared-types"

import { purchaseOrderQuery, purchaseOrdersQuery, useUpdatePurchaseOrder } from "./queries"
import { ReceivePurchaseOrder } from "./ReceivePurchaseOrder"

/**
 * The shop's purchase orders (US6).
 *
 * ⚠ STATUS IS CARRIED BY WORDS AND WEIGHT, NEVER A HUE (Principle V, research R3). The imported
 * mockup used amber for "in progress" states; 041 already removed amber from these screens and a shop
 * floor in bright light is the worst place to depend on a tint.
 */
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  submitted: "Sent",
  partially_received: "Part delivered",
  received: "Delivered",
  cancelled: "Cancelled",
}

/**
 * ⚠ "Part delivered" reads with EMPHASIS because it is the one state that still needs a human — goods
 * are outstanding and somebody has to chase them. Everything else is either finished or waiting on the
 * supplier, and needs nothing today.
 */
const EMPHASIS: Record<PurchaseOrderStatus, "success" | "muted"> = {
  draft: "muted",
  submitted: "muted",
  partially_received: "muted",
  received: "success",
  cancelled: "muted",
}

export function PurchaseOrders() {
  const { data, isPending, isError } = useQuery(purchaseOrdersQuery)
  const [receiving, setReceiving] = useState<string | null>(null)

  if (isPending || isError || (data ?? []).length === 0) {
    // ⚠ Absent rather than an empty state: this section is secondary to the shortage list above it,
    // and an empty box under a list the operator came here for is noise, not information.
    return null
  }

  return (
    <section className="space-y-3">
      <div className="border-b pb-2">
        <h2 className="text-sm font-semibold">Purchase orders</h2>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead>Estimated</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((po) => (
              <TableRow key={po.id}>
                <TableCell className="font-medium">{po.reference}</TableCell>
                <TableCell>{po.supplierName}</TableCell>
                <TableCell className="tabular-nums">{po.lineCount}</TableCell>
                <TableCell className="tabular-nums">
                  {/* ⚠ An unknown total and a zero total are different facts, and the server sends
                      null for the first. Rendering "0.00" here would be a lie about money. */}
                  {po.estimatedTotal === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    `${po.currency} ${po.estimatedTotal}`
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={EMPHASIS[po.status]}>{STATUS_LABEL[po.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <RowActions id={po.id} status={po.status} onReceive={() => setReceiving(po.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {receiving ? (
        <ReceiveDialog id={receiving} onClose={() => setReceiving(null)} />
      ) : null}
    </section>
  )
}

function RowActions({
  id,
  status,
  onReceive,
}: {
  id: string
  status: PurchaseOrderStatus
  onReceive: () => void
}) {
  const update = useUpdatePurchaseOrder(id)

  // ⚠ Exactly one forward action is ever offered, derived from the state the server last reported —
  // the same rule the order pick screen holds to, so a second operator cannot double-apply one.
  if (status === "draft") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={update.isPending}
        onClick={() => update.mutate({ status: "submitted" })}
      >
        Send to supplier
      </Button>
    )
  }
  if (status === "submitted" || status === "partially_received") {
    return (
      <Button size="sm" variant="outline" onClick={onReceive}>
        Record delivery
      </Button>
    )
  }
  return null
}

/** Loads the full order (with its lines) only when someone actually opens the receive flow. */
function ReceiveDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useQuery(purchaseOrderQuery(id))
  if (!data) return null
  return <ReceivePurchaseOrder order={data} open onOpenChange={(o) => (o ? null : onClose())} />
}
