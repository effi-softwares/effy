import type { ReactNode } from "react"

import type { FulfillmentStatus } from "../model"
import type { OrderRow } from "../orderConsole"
import { PAYMENT_LABEL } from "../orderConsole"
import { cn } from "@/lib/utils"

/**
 * The design's status pill (`padding:2px 8px; border-radius:999px; 11.5px/500; 1px border`) with its
 * five tones — warn · info · pos · neg · muted.
 *
 * ⚠ THE TONES ARE NOW THE DESIGN'S, AS AUTHORED. They used to be weight-based: the mockup's warn was
 * amber (a third UI hue the monochrome constitution forbade) and its pos put `--success` under text
 * at 4.00:1. The theme adoption supplies a real `--warning` and re-tunes `--success` to #0d8043,
 * which clears 4.5:1 on its own tint — so both objections are answered and the map is adopted whole.
 *
 * ⚠ EVERY PILL STILL KEEPS ITS WORDS. Nothing here depends on the fill to be understood; the colour
 * is what makes the right row findable in a list of forty.
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

// ⚠ 073 — `ORDER_STATUS_LABEL` and `OrderStatusPill` STOOD HERE. They named the shop's own status,
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
