import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { formatMoney, formatWhen, type OrderDetail } from "../orderConsole"

export function TotalRow({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1",
        strong && "mt-1 border-t border-border pt-2.5 font-semibold",
      )}
    >
      <span className={cn(!strong && "text-muted-foreground")}>{label}</span>
      <span className="whitespace-nowrap tabular-nums">{value}</span>
    </div>
  )
}

const REFUND_STATUS: Record<string, string> = {
  submitting: "sending",
  submitted: "with the bank",
  succeeded: "returned",
  failed: "failed",
  refused: "refused",
}

const REFUND_REASON: Record<string, string> = {
  item_not_supplied: "Not supplied",
  item_unusable: "Unusable",
  order_cancelled: "Order cancelled",
  goodwill: "Goodwill",
  external: "Outside the platform",
}

export function RefundedBox({ detail }: { detail: OrderDetail }) {
  const m = detail.money
  return (
    <div className="mt-3 grid gap-1 border-t border-border pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-medium">Refunded</div>
        <div className="font-semibold whitespace-nowrap tabular-nums">−{formatMoney(m.refunded, m.currency)}</div>
      </div>
      {detail.refunds.map((r) => (
        <div key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            {REFUND_REASON[r.reason] ?? r.reason} · {formatWhen(r.createdAt)} · {REFUND_STATUS[r.status] ?? r.status}
            {r.actorLabel ? ` · ${r.actorLabel}` : ""}
          </div>
          <div className="whitespace-nowrap tabular-nums">{formatMoney(r.amount, m.currency)}</div>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-2 font-semibold">
        <div>Net paid</div>
        <div className="whitespace-nowrap tabular-nums">{formatMoney(m.net, m.currency)}</div>
      </div>
    </div>
  )
}
