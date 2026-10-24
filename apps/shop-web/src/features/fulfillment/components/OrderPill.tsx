import type { ReactNode } from "react"
import { CircleAlert, CircleCheck, Hourglass, type LucideIcon } from "lucide-react"

import type { OrderRow } from "../orderConsole"
import { PAYMENT_LABEL } from "../orderConsole"
import { cn } from "@/lib/utils"

/**
 * The status pill in five tones (warn · info · pos · neg · muted). Every pill keeps its words; the colour
 * only makes a row findable.
 */
type Tone = "warn" | "info" | "pos" | "neg" | "muted"

/** The closed mapping as status words: waiting → outline · in progress → blue · done → green · problem → black · inert → grey. */
const TONE_CLASS: Record<Tone, string> = {
  warn: "bo-st--waiting",
  info: "bo-st--moving",
  pos: "bo-st--done",
  neg: "bo-st--problem",
  muted: "bo-st--muted",
}

const TONE_ICON: Record<Tone, LucideIcon | null> = {
  warn: Hourglass,
  info: null,
  pos: CircleCheck,
  neg: CircleAlert,
  muted: null,
}

export function TonePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = TONE_ICON[tone]
  return (
    <span className={cn("bo-st", TONE_CLASS[tone])}>
      {Icon ? <Icon aria-hidden="true" /> : null}
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
