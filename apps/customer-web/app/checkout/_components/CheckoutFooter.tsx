import { BrandMark } from "@/components/storefront/BrandMark"

/**
 * A compact checkout footer — the SAME dark treatment as the storefront's {@link StorefrontFooter}
 * (`bg-foreground text-background`, the brand mark, "© Effy"), but with the nav/link columns and CTA
 * band dropped and a much shorter height, so it closes the page without inviting the shopper out of
 * the payment funnel.
 *
 * No `new Date()` for the year — a non-deterministic call would cost the static shell for a number
 * nobody reads (same reason the storefront footer prints a bare "© Effy").
 */
export function CheckoutFooter() {
  return (
    <footer className="mt-16 bg-foreground text-background/80">
      <div className="container flex flex-col items-center justify-between gap-3 py-6 text-sm sm:flex-row">
        {/* `href={null}` — non-linking mark; the header already links home, so a second home target
            here would be a duplicate for keyboard users, exactly as the storefront footer does it. */}
        <BrandMark href={null} className="text-background" />
        <span>© Effy</span>
      </div>
    </footer>
  )
}
