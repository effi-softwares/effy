import Link from "next/link"
import { Headphones, PiggyBank, UserRound } from "lucide-react"

import { BrandMark } from "@/components/storefront/BrandMark"
import { ActionLink } from "@/components/storefront/actions"

/**
 * The storefront's closing blocks, structured from the tech-store reference (025 UI refresh).
 *
 * The reference closes every page with three stacked bands, and the order matters — it moves from
 * reassurance, to capture, to navigation:
 *
 *  1. A VALUE-PROP STRIP: three circular icons over a tinted band (Product Support / Personal Account
 *     / Amazing Savings). It answers "can I trust this shop" at the moment a shopper has finished
 *     looking and is deciding.
 *  2. A capture band.
 *  3. A DARK five-column footer.
 *
 * Two substitutions, both because a promise the platform cannot keep is worse than an empty slot:
 *
 *  - The reference's newsletter POSTs somewhere. Effy has no newsletter capability, so that band
 *    carries the storefront's real promise and routes into the catalogue, rather than collecting an
 *    address nothing will ever send to.
 *  - The value props state things that are TRUE of Effy as built — guest browsing, one delivery, real
 *    serviced zones — not the reference's "Up to 70% off" or "3 years on-site warranty".
 */
export function StorefrontFooter() {
  return (
    <>
      {/* ── 1. Value props ───────────────────────────────────────────────────────────────────── */}
      {/* <section className="mt-16 border-t bg-background">
        <div className="container grid gap-8 py-12 sm:grid-cols-3">
          <ValueProp
            icon={<Headphones className="size-5" aria-hidden="true" />}
            title="Browse without an account"
            body="The whole catalogue is open. We only ask who you are when you place an order."
          />
          <ValueProp
            icon={<UserRound className="size-5" aria-hidden="true" />}
            title="One basket, one delivery"
            body="However many shelves your order comes from, you pay once and track it in one place."
          />
          <ValueProp
            icon={<PiggyBank className="size-5" aria-hidden="true" />}
            title="Know before you shop"
            body="Set your postcode and we'll tell you straight away whether we deliver to you."
          />
        </div>
      </section> */}

      {/* ── 2. Closing CTA ───────────────────────────────────────────────────────────────────── */}
      <section className="bg-foreground text-background mt-16">
        <div className="container flex flex-col gap-5 py-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Start your first order</h2>
            <p className="mt-1.5 text-sm text-background/70">
              Fresh groceries and everyday essentials, delivered.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ActionLink href="/search" size="md">
              Shop all products
            </ActionLink>
          </div>
        </div>
      </section>

      {/* ── 3. Dark footer ───────────────────────────────────────────────────────────────────── */}
      <footer className="bg-foreground text-background/80">
        <div className="container py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            <FooterColumn
              title="Shop"
              links={[
                { label: "All products", href: "/search" },
                { label: "On sale", href: "/search?saleOnly=true" },
                { label: "Your cart", href: "/cart" },
              ]}
            />
            <FooterColumn
              title="Your account"
              links={[
                { label: "Account", href: "/account" },
                { label: "Orders", href: "/orders" },
                { label: "Addresses", href: "/account?tab=addresses" },
                { label: "Saved items", href: "/saved" },
              ]}
            />
            <FooterColumn
              title="Getting started"
              links={[
                { label: "Sign in", href: "/sign-in" },
                { label: "Create an account", href: "/sign-up" },
                { label: "Reset password", href: "/reset-password" },
              ]}
            />
            <FooterColumn
              title="Legal & company"
              links={[
                { label: "About Effy", href: "/about" },
                { label: "Privacy policy", href: "/legal/privacy-policy" },
                { label: "Terms of service", href: "/legal/terms-of-service" },
                { label: "Refunds & returns", href: "/legal/refunds-returns" },
                { label: "Delivery", href: "/legal/delivery-policy" },
                { label: "Food safety & allergens", href: "/legal/food-safety-allergens" },
                { label: "All legal documents", href: "/legal" },
                { label: "Delete your account", href: "/delete-account" },
              ]}
            />
            <div>
              {/* The real mark, not a text heading — same generated asset as the header, so the two
                  can never drift apart. `href={null}` because a footer logo linking home beside a
                  "Shop" column that also links home is a duplicate target for keyboard users. */}
              <BrandMark href={null} className="mb-4 text-background" />
              <p className="text-sm leading-relaxed">
                Fresh groceries and everyday essentials, brought to your door. One brand, one basket,
                one delivery.
              </p>
            </div>
          </div>

          {/* No `new Date()` — under cacheComponents a non-deterministic call during prerender is a
              dynamic API, and a live copyright year would cost this layout its static shell on every
              page to render a number nobody reads. */}
          {/* No appearance switcher: the customer storefront is light-only (operator decision). */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-background/15 pt-6 text-sm">
            <span>© Effy</span>
          </div>
        </div>
      </footer>
    </>
  )
}

function ValueProp({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* The reference's circular accent badge — the one place a filled circle appears. */}
      <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
        {icon}
      </span>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string }[]
}) {
  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold text-background">{title}</h2>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm hover:text-background">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
