import type { ReactNode } from "react"
import { CircleAlert, CircleCheck, Hourglass, type LucideIcon } from "lucide-react"

import { type OrderRow, PAYMENT_LABEL } from "../orderConsole"
import { Badge } from "@effy/design-system/ui"

type Tone = "warn" | "info" | "pos" | "neg" | "muted"

const TONE_VARIANT: Record<Tone, "warning" | "default" | "success" | "destructive" | "muted"> = {
  warn: "warning",
  info: "default",
  pos: "success",
  neg: "destructive",
  muted: "muted",
}

const TONE_ICON: Record<Tone, LucideIcon | null> = {
  warn: Hourglass,
  info: null,
  pos: CircleCheck,
  neg: CircleAlert,
  muted: null,
}

function TonePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = TONE_ICON[tone]
  return (
    <Badge variant={TONE_VARIANT[tone]}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </Badge>
  )
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

export function paymentTextClass(state: OrderRow["payment"]): string {
  if (state === "paid") return "text-muted-foreground"
  if (state === "refunded") return "text-destructive"
  return "text-warning font-semibold"
}
