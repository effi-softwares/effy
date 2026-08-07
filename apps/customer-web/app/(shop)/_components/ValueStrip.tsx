import { Eye, Store, Truck } from "lucide-react"

/**
 * The three value panels beneath the hero (039 FR-010, US1).
 *
 * ⚠⚠ THE ONLY COLOURED CHROME ON THE PLATFORM — A RECORDED, DELIBERATE EXCEPTION ⚠⚠
 *
 * Effy is monochrome. Principle V (constitution v1.11.0) permits a neutral ramp plus exactly two
 * semantic colours and says **no third hue may be introduced**; this feature's own FR-005/SC-004 repeat
 * it. These three panels break that, **on explicit operator direction (2026-08-07)**, to match the
 * reference storefront's composition.
 *
 * The exception is scoped as narrowly as it can be, following the precedent 024 set for the mobile
 * splash grounds:
 *
 *   • **Component-local.** The values live in this file and nowhere else.
 *   • **NOT design tokens.** `tokens.css` is untouched, no Compose theme is regenerated, `tokens:check`
 *     passes unchanged, and the other five surfaces do not move. Nothing else on this platform can
 *     reach these colours, because there is nothing to import.
 *   • **Not reusable.** They are named for the panel they fill, not for a role. There is no
 *     `--color-brand-orange`, because that is how an exception becomes a palette.
 *
 * FR-005 was amended in the spec to record it rather than leaving the code contradicting the
 * requirement. If the monochrome rule is ever reasserted, deleting this constant is the whole revert.
 *
 * ── Contrast, and why the text colours are not all white ────────────────────────────────────────
 *
 * ⚠ THE REFERENCE'S OWN PANELS FAIL WCAG AA. Measured against white text: orange `#F95F09` is
 * **3.15:1** (large text only) and green `#6BB252` is **2.59:1** (fails outright); only the dark green
 * passes, at 10.77:1. Copying it faithfully would ship body copy nobody with low vision could read.
 *
 * The fills are therefore kept EXACTLY as the operator asked, and the FOREGROUND is chosen per panel:
 * near-black on the two light fills (6.67:1 and 8.12:1), white on the dark one (10.77:1). Adapting the
 * text is a smaller deviation than repainting the colours that were actually specified — and it is the
 * same reasoning `onScrim`/`onLightScrim` already encode: legibility decides the type colour, the
 * ground decides which way.
 */
const PANELS = [
  {
    fill: "#F95F09",
    /** 6.67:1 against #F95F09. White would be 3.15:1 — large text only. */
    text: "text-neutral-950",
    sub: "text-neutral-950/75",
    Icon: Store,
    value: "One brand",
    label: "every product is Effy's own — no third-party sellers",
  },
  {
    fill: "#374128",
    /** 10.77:1 against #374128 — the one panel the reference gets right. */
    text: "text-white",
    sub: "text-white/75",
    Icon: Eye,
    value: "No account",
    label: "needed to browse — we ask who you are when you order",
  },
  {
    fill: "#6BB252",
    /** 8.12:1 against #6BB252. White would be 2.59:1 — a genuine accessibility failure. */
    text: "text-neutral-950",
    sub: "text-neutral-950/75",
    Icon: Truck,
    value: "Same day",
    label: "in serviced areas",
  },
] as const

/** Exported for the honesty test — every claim must be true of the platform as built (FR-010). */
export const VALUE_CLAIMS = PANELS.map((p) => ({ value: p.value, label: p.label }))

export function ValueStrip() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 sm:pb-14">
      {/* ⚠ Overlaps the banner's bottom edge, as the reference does — the panels sit half on the
          artwork and half on the page. `-mt-*` pulls them up; `relative` keeps them above the image.
          On phone they stack and the overlap is dropped: three stacked panels hanging off the banner
          would cover the artwork entirely. */}
      <dl className="relative z-10 grid grid-cols-1 overflow-hidden rounded-xl sm:grid-cols-3 sm:-mt-12 lg:-mt-16">
        {PANELS.map(({ fill, text, sub, Icon, value, label }) => (
          <div
            key={value}
            className={`flex items-start gap-3 px-5 py-5 sm:px-6 ${text}`}
            style={{ backgroundColor: fill }}
          >
            <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0" strokeWidth={2} />
            <div>
              <dt className="text-base font-bold leading-tight">{value}</dt>
              <dd className={`mt-1 text-xs leading-snug ${sub}`}>{label}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  )
}
