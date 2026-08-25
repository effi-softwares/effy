"use client"

import { AlertCircle, Clock, Lock } from "lucide-react"

import type { PaymentFailure } from "./failures"

/**
 * A refusal the shopper can act on (051 US5).
 *
 * ⚠ `role="alert"` so it is ANNOUNCED, not merely rendered. A shopper using a screen reader who
 * presses pay and hears nothing has no way to know the payment was refused — they will press again
 * (FR-034, and it is why FR-041's single-submission guard is separate from this).
 *
 * ⚠ Not a card container (FR-035): a left rule and space carry it, same as everything else here.
 */
export function PaymentNotice({
  failure,
  kind = "error",
}: {
  failure: Pick<PaymentFailure, "title" | "detail">
  /** `waiting` is for states that are not failures — a bank approval in progress, for instance. */
  kind?: "error" | "waiting" | "secure"
}) {
  const Icon = kind === "waiting" ? Clock : kind === "secure" ? Lock : AlertCircle

  return (
    <div
      role="alert"
      className={[
        "flex gap-3 border-l-2 py-1 pl-3.5",
        kind === "error" ? "border-destructive" : "border-border",
      ].join(" ")}
    >
      <Icon
        className={[
          "mt-0.5 size-4 shrink-0",
          kind === "error" ? "text-destructive" : "text-muted-foreground",
        ].join(" ")}
        aria-hidden="true"
      />
      <p className="text-sm leading-relaxed">
        <span className="font-medium">{failure.title}</span>{" "}
        <span className="text-muted-foreground">{failure.detail}</span>
      </p>
    </div>
  )
}
