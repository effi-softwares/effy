import type { Metadata } from "next"
import { Coins, Package, ShoppingBag, Truck } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { getDocument, sellerIdentity } from "@effy/legal-content"

import { LegalBody } from "@/components/legal/LegalDocumentView"
import { ActionLink } from "@/components/storefront/actions"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/misc"

export const metadata: Metadata = {
  title: "About Effy",
  description: "Who operates Effy, and how to contact us.",
}

/**
 * About Effy (reference: Help & info · About Effy): what Effy is, how an order reaches you, and who
 * the business is.
 *
 * Nothing here is a number someone else sets. A courier's timeframe, what a point is worth and
 * where the vans go are the operator's settings and change without this page: it says what each
 * thing IS and leaves the figure to the place that knows it (checkout, the points page).
 *
 * The company details come from `@effy/legal-content` and only what is recorded is shown — a
 * missing ABN or address is left out, never filled with a placeholder. The authored "about"
 * document follows them, as written.
 */
export default function AboutPage() {
  // Fails the build if the authored document is missing, rather than rendering a page without it.
  getDocument("about")
  const seller = sellerIdentity()
  const details: Array<[string, string | null]> = [
    ["Trading name", seller.tradingName],
    ["Legal entity", [seller.legalEntityName, seller.abn ? `ABN ${seller.abn}` : null].filter(Boolean).join(" · ") || null],
    ["Registered address", seller.registeredAddress],
    ["Contact", seller.supportEmail],
  ]

  return (
    <div className="container py-10">
      <Breadcrumb className="mb-6" items={[{ label: "Home", href: "/" }, { label: "About" }]} />

      <section className="mb-16 grid items-center gap-10 md:grid-cols-2">
        <div className="space-y-4">
          <Badge variant="brand">About Effy</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Groceries, delivered — by people who pack them like their own.</h1>
          <p className="text-lg text-muted-foreground">
            Effy is an Australian online grocery store. We pick, pack and deliver everyday food and household
            essentials with our own drivers, and send by courier where they don&apos;t reach yet.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <ActionLink href="/search" size="lg">
              Start shopping
            </ActionLink>
            <ActionLink href="/legal/delivery-policy" size="lg" variant="outline">
              How delivery works
            </ActionLink>
          </div>
        </div>
        <div aria-hidden="true" className="grid aspect-4/3 place-items-center rounded-xl bg-secondary text-muted-foreground">
          <ShoppingBag className="size-24" />
        </div>
      </section>

      <section className="mb-16 grid gap-4 md:grid-cols-3">
        <Point icon={Truck} title="Delivered by Effy">
          Choose a window for today or one of the next delivery days. Our own drivers bring it to your door.
        </Point>
        <Point icon={Package} title="Courier where we can't reach">
          Outside our delivery area a courier partner brings your order. Its timeframe is shown at checkout, and is an
          estimate.
        </Point>
        <Point icon={Coins} title="Points that pay">
          Effy points are a way of paying. Use them for part or all of an order — your account shows what they are worth.
        </Point>
      </section>

      <section aria-labelledby="company" className="mb-16 flex flex-col gap-6 rounded-lg border bg-card p-6 shadow-xs">
        <h2 id="company" className="leading-none font-semibold">
          Company details
        </h2>
        <dl className="grid gap-4 text-sm md:grid-cols-2">
          {details.map(([label, value]) =>
            value ? (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </section>

      <section className="max-w-[760px]">
        <LegalBody slug="about" />
      </section>
    </div>
  )
}

function Point({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-6 shadow-xs">
      <Icon aria-hidden="true" className="size-5" />
      <h2 className="leading-tight font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
