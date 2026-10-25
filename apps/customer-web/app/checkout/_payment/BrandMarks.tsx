/**
 * Payment network marks, monochrome stand-ins: the constitution's third-party colour exception covers
 * sign-in marks only. Coloured marks would be the official artwork (each network has usage rules), as
 * component-local constants here, never design tokens.
 */

const CHIP =
  "inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary text-xs font-semibold tracking-[0.04em] text-muted-foreground"

/** One network chip. `label` is the network's short name, not a logo. */
export function NetworkMark({ label }: { label: string }) {
  return (
    <span className={CHIP} aria-hidden="true">
      {label}
    </span>
  )
}

/**
 * The networks Effy accepts, shown together.
 *
 * `aria-hidden` throughout: these repeat what the row's own text already says ("Visa, Mastercard,
 * American Express"), and announcing both would read the list twice to a screen reader.
 */
export function AcceptedNetworks({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <span className="flex gap-2">
        <NetworkMark label="VISA" />
        <NetworkMark label="MC" />
        <NetworkMark label="AMEX" />
      </span>
    </span>
  )
}

/** The card networks Effy can accept, in the order the row lists them. */
export const ACCEPTED_NETWORKS = ["VISA", "MC", "AMEX"] as const

/**
 * Map a provider brand slug to the label shown on a saved card.
 * Unknown brands fall back to a neutral label rather than rendering an empty chip.
 */
export function brandLabel(brand: string): string {
  switch (brand.toLowerCase()) {
    case "visa":
      return "VISA"
    case "mastercard":
      return "MC"
    case "amex":
    case "american_express":
      return "AMEX"
    default:
      return "CARD"
  }
}
