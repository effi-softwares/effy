import { ActionLink, Display } from "@/components/storefront/kit"

/**
 * The storefront hero (025 UI refresh — template #1's composition).
 *
 * A tinted full-bleed band, an oversized display headline, a short supporting line, one solid pill
 * CTA, and a row of statistics separated by rules. The stat row is what makes the band read as a
 * storefront rather than a banner — it is the only place the page makes a claim about the business.
 *
 * ⚠ Effy's numbers are REAL or absent. The reference ships "200+ International Brands / 2,000+
 * High-Quality Products / 30,000+ Happy Customers"; on a store with 38 seeded products that is a lie
 * printed at 64px. These state things that are true of the platform as built. When the catalogue is
 * large enough to boast about, real counts can replace them.
 */
export function Hero() {
  return (
    <section className="bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <Display as="h1" size="hero" className="max-w-3xl">
          Everything you need, delivered
        </Display>

        <p className="mt-5 max-w-xl text-sm text-muted-foreground sm:text-base">
          Fresh groceries and everyday essentials from one brand. Browse without an account — we only
          ask who you are when you place an order.
        </p>

        <ActionLink href="/browse" size="lg" className="mt-8">
          Shop now
        </ActionLink>

        <dl className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-6 sm:gap-x-12">
          <Stat value="One" label="basket, one delivery" />
          <Divider />
          <Stat value="No account" label="needed to browse" />
          <Divider />
          <Stat value="Same day" label="in serviced areas" />
        </dl>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <dt className="sr-only">{label}</dt>
      <dd className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">{value}</dd>
      <span className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{label}</span>
    </div>
  )
}

function Divider() {
  return <span aria-hidden="true" className="hidden h-10 w-px bg-border sm:block" />
}
