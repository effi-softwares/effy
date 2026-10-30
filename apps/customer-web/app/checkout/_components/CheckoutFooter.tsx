import Link from "next/link"

/**
 * A compact checkout footer - the same dark treatment as the storefront's {@link StorefrontFooter}
 * (`bg-foreground text-background`, the brand mark, "© Effy"), but with the nav/link columns and CTA
 * band dropped and a much shorter height, so it closes the page without inviting the shopper out of
 * the payment funnel.
 *
 * No `new Date` for the year - a non-deterministic call would cost the static shell for a number
 * nobody reads (same reason the storefront footer prints a bare "© Effy").
 */
export function CheckoutFooter() {
  return (
    <footer className="mt-12 border-t">
      <div className="container flex items-center justify-between gap-4 py-6 text-sm text-muted-foreground">
        <span>© Effy</span>
        <nav aria-label="Checkout help" className="flex gap-6">
          <Link href="/legal/terms-of-service" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/legal/privacy-policy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/help" className="hover:text-foreground">
            Help
          </Link>
        </nav>
      </div>
    </footer>
  )
}
