import { Display, MediaFrame } from "@/components/storefront/kit"

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
    <section className="container py-12 sm:py-16">
      <div className="grid items-center gap-8 rounded-3xl bg-muted px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-2 lg:gap-12">
        <div>
          <Display size="sub">The Effy app is on its way</Display>

          <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
            We&rsquo;re building Effy for iPhone and Android — the same shop, the same basket, in your
            pocket. It isn&rsquo;t in the stores yet. When it is, it&rsquo;ll be right here.
          </p>

          <div className="mt-7">
            <StoreBadges />
          </div>
        </div>

        {/* Space for app artwork. There is none yet, so this is the neutral placeholder — the same
            supported-absence path the hero uses, rather than a stock phone mockup of a screen that
            does not look like the app. */}
        <MediaFrame
          src={null}
          alt=""
          ratio="wide"
          fallbackLabel="Effy"
          rounded="rounded-2xl"
          className="hidden lg:block"
        />
      </div>
    </section>
  )
}
