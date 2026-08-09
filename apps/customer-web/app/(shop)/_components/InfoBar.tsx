/**
 * The information bar — a slim dark strip above the header that cycles through a few short lines
 * about the shop.
 *
 * ⚠⚠ EVERY LINE MUST BE TRUE OF THIS PLATFORM. ⚠⚠
 *
 * An announcement strip is where invented facts go to become promises. The obvious copy for one of
 * these — free delivery over $X, same-day slots, delivery in 30 minutes, a returns guarantee — is
 * marketing the platform has not built and cannot honour, and a shopper who reads it at the top of
 * every page will believe it. Each line below is annotated with the thing that makes it true; a line
 * without one does not belong here.
 *
 *   ⚠ Explicitly NOT claimed: free delivery (there is none), delivery times or windows, coverage
 *   areas, opening hours, a phone number, or any guarantee.
 *
 * ── Zero JavaScript, and that is a constraint rather than a flourish ────────────────────────────
 *
 * This renders on every public page, and `/` sits ~0.1 KB from its 174 KB guest budget. The natural
 * implementation — a client component with a `setInterval` and an index in state — would cost a
 * hydration boundary on the guest path and fail the gate.
 *
 * So all four lines are in the HTML at once, stacked, and CSS animates which one is visible. Nothing
 * hydrates, nothing runs, and the rotation works in the cached static shell before any JS arrives.
 *
 * ── Accessibility ──────────────────────────────────────────────────────────────────────────────
 *
 * ⚠ NO `aria-live`. This is decoration on a loop, not news: an announcer would interrupt whatever
 * the shopper is doing every five seconds, forever. Because every line is real DOM text, a screen
 * reader already reads all four once, in order, which is strictly more useful than hearing one line
 * repeatedly. `prefers-reduced-motion` stops the cycle entirely and pins the first line (FR-025 —
 * motion is decoration, never information).
 */

const MESSAGES = [
  // The platform's own description of what it sells (platform-brief).
  "Fresh groceries and everyday essentials",
  // Guest-first is the product model, not a slogan — 011/025 FR-001: the whole public surface works
  // with no account, and sign-in is deferred to checkout.
  "Browse freely — sign in only when you order",
  // True by construction: checkout computes the delivery charge server-side and shows it before the
  // payment step. It deliberately says COSTS ARE SHOWN, not that they are low or free.
  "Delivery costs shown before you pay",
  // 033 — saved items is a watchlist: it records the price at save time and reports movement.
  "Save items and watch their prices",
] as const

/**
 * ⚠ THE KEYFRAMES IN `globals.css` HARDCODE A QUARTER OF THE CYCLE, so the strip only reads
 * correctly with exactly four lines — five would overlap, three would leave a dead gap. CSS cannot
 * derive a keyframe percentage from a custom property, so this is a compile-time guard instead of a
 * comment nobody reads: adding or removing a line makes `pnpm typecheck` fail HERE, pointing at the
 * `.fx-ticker` percentages that have to change with it.
 */
const _messageCountMatchesKeyframes: 4 = MESSAGES.length

export function InfoBar() {
  return (
    <div className="bg-foreground text-background">
      <div className="container">
        {/* `relative` + a fixed height: the lines are stacked on top of each other, so the row cannot
            size itself from its content — without a height here it would collapse to nothing. */}
        <div className="fx-ticker relative h-9">
          {MESSAGES.map((message, i) => (
            <span
              key={message}
              // Each line's turn is its index — the CSS offsets one shared animation by this much
              // rather than defining four.
              style={{ "--fx-ticker-i": i } as React.CSSProperties}
              className="absolute inset-0 flex items-center justify-center truncate px-2 text-center text-xs"
            >
              {message}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
