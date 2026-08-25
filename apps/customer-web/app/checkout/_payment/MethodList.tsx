"use client"

import { PaymentElement } from "@stripe/react-stripe-js"
import { CalendarClock, CreditCard } from "lucide-react"

import { cn } from "@/lib/utils"

import { AcceptedNetworks } from "./BrandMarks"

/** Which family of payment the shopper is using. Card and pay-over-time are mutually exclusive. */
export type MethodKind = "card" | "later"

/**
 * The payment-method rows (051 US4).
 *
 * ⚠ EXACTLY ONE ELEMENT IS MOUNTED AT A TIME, and that is a correctness decision rather than a layout
 * one. A Payment Element and split card elements in the same Elements group create a genuine ambiguity
 * for `confirmPayment({elements})` — it collects from everything mounted, so an untouched card form
 * would fail validation while the shopper is trying to pay with Klarna. The docs do not settle whether
 * the combination is supported, and "probably fine" is not a standard for a payment path. Rendering one
 * or the other removes the question instead of betting on it.
 *
 * ⚠ WHY THE PROVIDER STATES THE INSTALMENT TERMS, NOT EFFY. FR-012 requires the number of payments,
 * the amount of each and whether interest applies to be shown before selection — and the Payment
 * Element renders exactly that, authored by Klarna and Zip themselves. Effy restating them would be
 * worse than redundant: instalment terms depend on the provider's own assessment of the shopper, so a
 * hardcoded "4 payments of $3.65, interest free" could be wrong for the person reading it. Under
 * Australian Consumer Law s18 a confident wrong number about credit is exactly the kind of statement
 * that gets a retailer in trouble, and it is not a number Effy controls.
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
  /**
   * Whether any pay-over-time option can be offered for this basket.
   *
   * ⚠ False must mean "genuinely none", not "we didn't check". An option offered and then refused
   * after the shopper commits is what FR-010 forbids; one omitted with no explanation is what FR-011
   * forbids. Absent is only correct when the provider reports nothing available at all.
   */
  laterAvailable: boolean
  busy?: boolean
  /** The card fields, rendered by the parent so this file stays free of element wiring. */
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5">
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
          <div className="px-[18px] pb-5 pt-1">
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
        "rounded-[14px] bg-card transition-shadow",
        // Selection reads as a doubled border rather than a fill, so it looks the same in either
        // appearance — the monochrome accent inverts, a fill would not (Principle V).
        selected
          ? "border border-foreground shadow-[0_0_0_1px_var(--foreground)]"
          : "border border-input",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        className="flex h-[74px] w-full items-center gap-3.5 px-[18px] text-left disabled:opacity-60"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]",
            selected ? "border-foreground" : "border-input",
          )}
        >
          <span className={cn("size-2.5 rounded-full", selected && "bg-foreground")} />
        </span>
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-secondary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium tracking-[-0.01em]">{title}</span>
          <span className="mt-0.5 block text-[13px] text-muted-foreground">{subtitle}</span>
        </span>
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </button>

      {selected && children ? <div>{children}</div> : null}
    </div>
  )
}
