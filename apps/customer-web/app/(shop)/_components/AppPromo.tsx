import { Card } from "@/components/ui/card"
import { sectionSpacing } from "@/components/storefront/kit"

import { StoreBadges } from "./StoreBadges"

/**
 * "Get the Effy app" (039 US5, FR-021/FR-022) — the reference's download band.
 *
 * ⚠ EVERY WORD HERE IS TRUE OF APPS THAT DO NOT EXIST YET, which is the whole difficulty of the
 * section. The reference says "Online Orders made easy, fast and reliable" beside two live store
 * badges. Effy's apps are built (`customer-mobile` exists) but **unpublished**, so the copy says they
 * are coming and the badges do not link anywhere (FR-022). No "download now", no "available on", no
 * invented rating, no invented store URL.
 *
 * ⚠ STATIC SHELL. It depends on no request-time data, so it renders in the prerendered page rather than
 * inside the streamed hole (contract row 7, FR-040) — it is there for a crawler and at first paint.
 *
 * Not cards: one sectioned band, copy left, artwork right. The `bg-muted` ground is a ramp token and
 * inverts with the appearance, unlike the value panels above it.
 */
export function AppPromo() {
  return (
    <section className={`container ${sectionSpacing}`}>
      <Card className="flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">The Effy app is on its way</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            We&rsquo;re building Effy for iPhone and Android — the same shop, the same basket, in your
            pocket. It isn&rsquo;t in the stores yet. When it is, it&rsquo;ll be right here.
          </p>
        </div>
        <StoreBadges tone="dark" />
      </Card>
    </section>
  )
}
