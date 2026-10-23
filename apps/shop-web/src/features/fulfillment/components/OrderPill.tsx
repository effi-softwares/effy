import type { ReactNode } from "react"

import type { OrderRow } from "../orderConsole"
import { PAYMENT_LABEL } from "../orderConsole"
import { cn } from "@/lib/utils"

/**
 * The status pill in five tones (warn · info · pos · neg · muted). Every pill keeps its words; the colour
 * only makes a row findable.
 */
type Tone = "warn" | "info" | "pos" | "neg" | "muted"

const TONE_CLASS: Record<Tone, string> = {
  // waiting / at-risk
  warn: "border-border bg-warning-soft text-warning font-medium",
  // in-progress — the work is moving
  info: "border-brand-mid bg-brand-soft text-brand-ink font-medium",
  // positive / complete
  pos: "border-border bg-success-soft text-success font-medium",
  // failed / refunded
  neg: "border-border bg-destructive-soft text-destructive font-medium",
  // inert — nothing to say about it
  muted: "border-border bg-muted text-muted-foreground font-medium",
}

export function TonePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] whitespace-nowrap",
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  )
}

// `ORDER_STATUS_LABEL` and `OrderStatusPill` stood here. They named the shop's own status,
// which stops at "Collected", so a shop never saw its package reach the hub or the customer. The pill
// is now `PackageStatusPill` (web-kit), reading the server's one derived status in the words every
// staff screen uses.

const PAYMENT_TONE: Record<OrderRow["payment"], Tone> = {
  paid: "pos",
  refund_pending: "warn",
  partially_refunded: "warn",
  refunded: "neg",
}

export function PaymentPill({ state }: { state: OrderRow["payment"] }) {
  return <TonePill tone={PAYMENT_TONE[state]}>{PAYMENT_LABEL[state]}</TonePill>
}

/** The list's payment column colours text only — muted when paid, loud otherwise (the design's rule). */
export function paymentTextClass(state: OrderRow["payment"]): string {
  if (state === "paid") return "text-muted-foreground"
  if (state === "refunded") return "text-destructive"
  // Pending/partial refunds are money in motion — the design's "waiting" tone, not bold black.
  return "text-warning font-semibold"
}
