/**
 * The receipt's bounded status palette — 052 FR-015, a RECORDED EXCEPTION to Principle V.
 *
 * ── Read this before adding anything here ───────────────────────────────────────────────────────
 *
 * The constitution permits exactly TWO semantic colours (`--destructive` #e01010 and `--success`
 * #0c9409) and forbids a third as a UI colour. The same-day amber below IS a third. It is recorded in
 * specs/052-order-confirmation-invoice/plan.md § Complexity Tracking, and it is bounded by six rules
 * that SC-010 checks mechanically:
 *
 *   1. It lives HERE, in one file, and nowhere else. It is NOT in
 *      `packages/design-system/src/tokens.css`, and `tokens:check` passing UNCHANGED is the proof.
 *   2. It is never surfaced to the mobile Compose theme. (customer-mobile keeps its own local copy —
 *      duplicated deliberately, because sharing it would mean putting it in the design system.)
 *   3. It is never a page accent, fill, border, or body-text colour. Status indicators only.
 *   4. ⚠ THE HUE IS NEVER TEXT. Every pill puts its colour in a DOT and leaves the label on the
 *      neutral ramp. This is not decoration: `--success` deliberately has no `-foreground` pair
 *      because it measures 4.00:1 — above the 3:1 bar for a non-text UI indicator, below the 4.5:1
 *      bar for text. A green label would break the very rule the palette is an exception to.
 *   5. Colour is never the sole carrier of meaning. Delete every hue below and the receipt still
 *      reads correctly, because the words carry it.
 *   6. Removing this file's one export reverts the exception.
 *
 * ⚠ DO NOT "promote" this to a design token to reduce duplication. The duplication IS the boundary.
 * If a future slice wants a platform-wide status system, that is a constitution amendment with its
 * own evidence — not a side effect of a receipt.
 *
 * ⚠ THESE THREE DARK TINTS HAVE NOW BEEN RE-DERIVED TWICE FOR ONE THEME CHANGE, AND THAT IS THE
 * WHOLE ARGUMENT FOR WHY A HARDCODED VALUE IS NOT A TOKEN. The original darks were picked to sit one
 * step LIGHTER than a navy ground. When the ground went grey it was lighter than all three, so every
 * tint flipped to the DARK side of its surface — a wash became a hole at 1.1:1 against the page —
 * while the `standard` tone, which reads --muted THROUGH THE THEME, stayed correct without anyone
 * touching it. Then the ground went near-black and --muted came down with it, and the replacements
 * were suddenly the BRIGHTEST things in the row. Three tones wrong twice; the fourth right both times,
 * for free. Nothing failed on either occasion: no DOM assertion can see a chip that has become a hole.
 * The values below sit within a hair of --muted at the near-black ground, so the row reads as one
 * family again — and they will need checking the next time the ground moves.
 */

/*
 * ⚠ 084 — THE STOREFRONT IDENTITY REPLACED THIS PALETTE'S VALUES. The notes above describe the
 * monochrome-era reasoning (two semantic colours, literal hexes, a dark appearance); none of that
 * holds on the storefront now. The tones are the identity's five values and nothing else:
 *   paid       green   (`brand` on `brand-muted`)
 *   same_day   blue    (`primary` on `primary-muted`) — the window today, which costs more
 *   standard   grey
 *   attention  BLACK on grey — there is no red; the word beside the dot carries the meaning.
 * No hex and no `dark:` variant may come back (`scripts/check-no-storefront-red.sh`).
 */
export type ReceiptStatusTone = "paid" | "same_day" | "standard" | "attention"

/**
 * A tone's rendering, as Tailwind classes.
 *
 * `dot` is the ONLY coloured thing. `tint` is a near-neutral wash light enough that the label — which
 * stays `text-foreground` — keeps its full ramp contrast in both appearances.
 */
export type ToneClasses = {
  readonly tint: string
  readonly dot: string
}

export const RECEIPT_STATUS_TONES: Readonly<Record<ReceiptStatusTone, ToneClasses>> = {
  /** Payment received; order delivered. The constitution's own `--success`, used as a non-text dot. */
  paid: {
    tint: "bg-brand-muted",
    dot: "bg-brand",
  },
  /** ⚠ THE ONE GENUINELY NEW HUE. Distinguishes an expedited package the shopper paid more for. */
  same_day: {
    tint: "bg-primary-muted",
    dot: "bg-primary",
  },
  /** Pure ramp — the DEFAULT needs no hue, only the exception does. */
  standard: {
    tint: "bg-muted",
    dot: "bg-muted-foreground",
  },
  /**
   * Needs attention — a terminal shortfall today; a refund later. The constitution's `--destructive`.
   * Drawn now so a later refunds slice has nothing to invent.
   */
  attention: {
    tint: "bg-muted",
    dot: "bg-foreground",
  },
}

/** The delivery methods the platform can quote, mapped to a tone. */
export function toneForDeliveryMethod(method: string): ReceiptStatusTone {
  return method === "same_day" ? "same_day" : "standard"
}
