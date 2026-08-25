/**
 * Payment network marks (051 FR-031/FR-032).
 *
 * ⚠ CURRENTLY MONOCHROME, AND DELIBERATELY SO. Principle V's third-party exception is scoped, verbatim,
 * to "a third-party **sign-in** mark whose provider's brand guidelines require its own colours". A
 * payment network mark is the same asset ROLE and is governed by the same kind of brand rules, but it is
 * not a sign-in mark — so shipping these in Visa blue today would be a violation dressed as an
 * exception, not an exception.
 *
 * Widening that clause to third-party marks generally is a MINOR constitution amendment, tracked as 051
 * T002 (research R13). Until it moves, these stay neutral.
 *
 * ⚠ WHEN IT DOES MOVE, the colour goes HERE and nowhere else — component-local constants, the way 039's
 * coloured panels were bounded (FR-005a). No design token, no `tokens.css` entry, no Compose theme.
 * `tokens:check` passing unchanged is the mechanical proof the colour never entered the design system,
 * and deleting this one file is the whole revert.
 *
 * ⚠ AND THE ARTWORK MUST BE REPLACED, not recoloured. These are simplified stand-ins. Visa, Mastercard
 * and American Express each publish mandatory usage rules — clear space, minimum size, permitted
 * backgrounds, permitted variants — and a redrawn mark breaches all of them. T003 obtains the real
 * asset kits.
 */

const CHIP =
  "inline-flex h-[22px] w-[34px] shrink-0 items-center justify-center rounded-[4px] border border-border bg-secondary text-[8px] font-semibold tracking-[0.04em] text-muted-foreground"

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
 * ⚠ `aria-hidden` throughout: these repeat what the row's own text already says ("Visa, Mastercard,
 * American Express"), and announcing both would read the list twice to a screen reader.
 */
export function AcceptedNetworks({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <span className="flex gap-1.5">
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
