import { Smartphone } from "lucide-react"

/**
 * Google Play and App Store marks - present but non-interactive.
 *
 * There are no URLs in this file, and that is the point. The Effy apps are not published. A store
 * link would have to be invented, and an invented outward-facing identifier is exactly what the
 * constitution's real-world-identifier rule forbids - a wrong one that silently "works" reaches real
 * people before anyone notices. `StoreBadges.test.tsx` greps this module's own text for a store URL and
 * fails on any match, so the rule is mechanical rather than remembered.
 *
 * Not links, not buttons. These are `<span>`s. A disabled `<a>` is still focusable and still
 * announced as a link, which promises a destination that does not exist; a `<button disabled>` promises
 * an action. A shopper who taps here should get nothing, and a screen-reader user should be told the
 * apps are coming rather than handed a broken control.
 *
 * "Coming soon" is stated in words, not implied by dimming. Meaning never rests on colour or opacity
 * alone - a low-contrast badge with no label is indistinguishable from a broken image.
 *
 * The marks are drawn monochrome, on the ramp. They are deliberately generic renderings rather than the
 * official trademarked artwork: the real badges are supplied by each store under brand rules that apply
 * to *published* apps, and using them for something that does not exist yet would be wrong on both
 * counts. They get replaced with the official assets in the slice that ships the apps.
 */
export function StoreBadges({ tone = "outline" }: { tone?: "outline" | "dark" }) {
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {["App Store", "Google Play"].map((store) => (
        <li key={store}>
          {/* `role="img"`: a bare span may not carry an aria-label (axe aria-prohibited-attr), and
              a badge IS a picture with a caption - announced once, as the label says. */}
          <span
            role="img"
            aria-label={`${store} - coming soon`}
            className={
              tone === "dark"
                ? "inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-semibold text-background"
                : "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold"
            }
          >
            <Smartphone aria-hidden="true" className="size-4" />
            <span aria-hidden="true">{store} · Coming soon</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
