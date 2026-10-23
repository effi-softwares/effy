"use client"

import { AlertCircle, Clock, Lock } from "lucide-react"

import type { PaymentFailure } from "./failures"

/** A refusal the shopper can act on, announced (`role="alert"`). A left rule and space, not a card. */
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
        "flex gap-3 rounded-lg border px-4 py-3",
        kind === "error" ? "border-destructive" : "border-transparent bg-muted",
      ].join(" ")}
    >
      <Icon
        className={[
          "mt-0.5 size-4 shrink-0",
          kind === "error" ? "text-foreground" : "text-muted-foreground",
        ].join(" ")}
        aria-hidden="true"
      />
      <p className="text-sm leading-relaxed">
        <span className={kind === "error" ? "font-semibold" : "font-medium"}>{failure.title}</span>{" "}
        <span className={kind === "error" ? "" : "text-muted-foreground"}>{failure.detail}</span>
      </p>
    </div>
  )
}
