import Link from "next/link"
import { BrandMark } from "@/components/storefront/BrandMark"
import { chromePrefetch } from "@/lib/account-routes"

import { NewsletterForm } from "./NewsletterForm"
import { PaymentMarks } from "./PaymentMarks"
import { StoreBadges } from "./StoreBadges"

/**
 * The storefront footer: the newsletter row, four link columns, then the wordmark, the payment marks
 * and the app badges ("Coming soon", not links), in the header's container. The payment marks are text,
 * not scheme logos. `hello@effyshopping.com` is the approved customer-facing mailbox.
 */
const COLUMNS: ReadonlyArray<{ title: string; links: ReadonlyArray<{ label: string; href: string }> }> = [
  {
    title: "Shop",
    links: [
      { label: "All products", href: "/search" },
      { label: "On sale", href: "/search?saleOnly=true" },
      { label: "Offers", href: "/offers" },
      { label: "Your cart", href: "/cart" },
    ],
  },
  {
    title: "Your account",
    links: [
      { label: "Account", href: "/account" },
      { label: "Orders", href: "/orders" },
      { label: "Saved items", href: "/saved" },
      { label: "Addresses", href: "/addresses" },
      { label: "Sign in", href: "/sign-in" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Help & feedback", href: "/help" },
      { label: "Delivery", href: "/legal/delivery-policy" },
      { label: "Refunds & returns", href: "/legal/refunds-returns" },
      { label: "Food safety & allergens", href: "/legal/food-safety-allergens" },
      { label: "hello@effyshopping.com", href: "mailto:hello@effyshopping.com" },
    ],
  },
  {
    title: "Company & legal",
    links: [
      { label: "About Effy", href: "/about" },
      { label: "Privacy policy", href: "/legal/privacy-policy" },
      { label: "Terms of service", href: "/legal/terms-of-service" },
      { label: "All legal documents", href: "/legal" },
      { label: "Delete your account", href: "/delete-account" },
    ],
  },
]

export function StorefrontFooter() {
  return (
    <footer className="mt-12 border-t bg-background">
      <div className="container py-10">
        <NewsletterForm />

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-t pt-8 lg:grid-cols-4">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="mb-3 text-sm font-semibold">{column.title}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      prefetch={chromePrefetch(link.href)}
                      className="block py-1 text-sm break-words text-muted-foreground hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <BrandMark size={22} />
            <span className="text-sm text-muted-foreground">© Effy</span>
          </div>
          <PaymentMarks />
          <StoreBadges />
        </div>
      </div>
    </footer>
  )
}
