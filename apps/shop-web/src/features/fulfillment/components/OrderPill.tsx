import type { ReactNode } from "react"

import type { FulfillmentStatus } from "../model"
import type { OrderRow } from "../orderConsole"
import { PAYMENT_LABEL } from "../orderConsole"
import { cn } from "@/lib/utils"

/**
 * The design's status pill (`padding:2px 8px; border-radius:999px; 11.5px/500; 1px border`) with its
 * five tones — warn · info · pos · neg · muted.
 *
 * ⚠ THE TONES ARE THE DESIGN'S STRUCTURE IN THE PLATFORM'S COLOURS. The mockup's warn is amber and its
 * pos puts `--success` under text; the first is a third UI hue and the second fails AA at 4.00:1
 * (Principle V — see `components/console/primitives.tsx`). So warn reads by WEIGHT (foreground,
 * semibold), pos and muted are the quiet ramp, and neg uses the platform's one error colour, which the
 * design's neg also is. Every pill keeps its words, so nothing depends on the fill.
 */
type Tone = "warn" | "info" | "pos" | "neg" | "muted"

const TONE_CLASS: Record<Tone, string> = {
  warn: "bg-muted text-foreground font-semibold",
  info: "bg-background text-foreground font-medium",
  pos: "bg-muted text-muted-foreground font-medium",
  neg: "border-destructive/30 bg-destructive/10 text-destructive font-medium",
  muted: "bg-muted text-muted-foreground font-medium",
}

export function TonePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "border-border inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] whitespace-nowrap",
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  )
}

/** Operator words for each state — the design's "Awaiting pick / Packed / Shipped…" in Effy's model. */
export const ORDER_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  pending: "Awaiting pick",
  received: "Awaiting pick",
  picking: "Picking",
  ready_for_pickup: "Ready for pickup",
  collected: "Collected",
  delivered: "Delivered",
  unfulfillable: "Can't supply",
  withdrawn: "Cancelled",
}

const STATUS_TONE: Record<FulfillmentStatus, Tone> = {
  pending: "warn",
  received: "warn",
  picking: "warn",
  ready_for_pickup: "info",
  collected: "pos",
  delivered: "pos",
  unfulfillable: "neg",
  withdrawn: "neg",
}

export function OrderStatusPill({ status }: { status: FulfillmentStatus }) {
  return <TonePill tone={STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</TonePill>
}

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
  return "text-foreground font-semibold"
}
