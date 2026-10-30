"use client"

import { PaymentElement } from "@stripe/react-stripe-js"
import { CalendarClock, CreditCard } from "lucide-react"

import { cn } from "@/lib/utils"

import { AcceptedNetworks } from "./BrandMarks"

/** Which family of payment the shopper is using. Card and pay-over-time are mutually exclusive. */
export type MethodKind = "card" | "later"

/**
 * The payment-method rows. Exactly one element is mounted at a time: `confirmPayment({elements})`
 * collects from everything mounted, so an untouched card form could fail validation during a Klarna
 * payment. Instalment terms are the provider's own (they depend on its assessment of the shopper); Effy
 * never restates them.
 */
export function MethodList({
  selected,
  onSelect,
  laterAvailable,
  busy,
  children,
}: {
  selected: MethodKind
  onSelect: (kind: MethodKind) => void
  /** Whether any pay-over-time option can be offered for this basket, as the provider reports it (false means none, not unchecked). */
  laterAvailable: boolean
  busy?: boolean
  /** The card fields, rendered by the parent so this file stays free of element wiring. */
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <Row
        selected={selected === "card"}
        onSelect={() => onSelect("card")}
        disabled={busy}
        icon={<CreditCard className="size-5" aria-hidden="true" />}
        title="Card"
        subtitle="Visa, Mastercard, American Express"
        trailing={<AcceptedNetworks />}
      >
        {children}
      </Row>

      {laterAvailable ? (
        <Row
          selected={selected === "later"}
          onSelect={() => onSelect("later")}
          disabled={busy}
          icon={<CalendarClock className="size-5" aria-hidden="true" />}
          title="Pay over time"
          subtitle="Split your order into instalments"
        >
          <div className="px-5 pb-5 pt-1">
            <div className="mb-4 h-px bg-border" />
            {/*
              The provider's own rows, carrying the provider's own terms. `accordion` so each option
              states its instalment plan where the shopper reads it, before choosing.
            */}
            <PaymentElement
              options={{ layout: { type: "accordion", radios: "always", spacedAccordionItems: false } }}
            />
          </div>
        </Row>
      ) : null}
    </div>
  )
}

function Row({
  selected,
  onSelect,
  disabled,
  icon,
  title,
  subtitle,
  trailing,
  children,
}: {
  selected: boolean
  onSelect: () => void
  disabled?: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  trailing?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-card shadow-xs transition-shadow",
        // Selection reads as a doubled border rather than a fill, so it looks the same in either
        // appearance - the monochrome accent inverts, a fill would not (Principle V).
        selected ? "border border-primary" : "border border-input",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        className="flex h-19 w-full items-center gap-4 px-5 text-left disabled:opacity-60"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-primary" : "border-input",
          )}
        >
          <span className={cn("size-3 rounded-full", selected && "bg-primary-fill")} />
        </span>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium tracking-[-0.01em]">{title}</span>
          <span className="mt-1 block text-sm text-muted-foreground">{subtitle}</span>
        </span>
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </button>

      {selected && children ? <div>{children}</div> : null}
    </div>
  )
}
