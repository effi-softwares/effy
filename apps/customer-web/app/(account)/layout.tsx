import { StorefrontChrome } from "@/app/(shop)/_components/StorefrontChrome"
import { AccountNav } from "@/components/chrome/AccountNav"

/**
 * The account area's frame (reference: Account · every screen): the storefront header and footer,
 * then a sidebar of sections beside the page. Orders and Saved items live in the same frame — they
 * are account destinations, and the sidebar is how a customer moves between them.
 *
 * ⚠ Guarding is each PAGE's job (`requireCustomer`), not the layout's: a layout does not re-run on
 * navigation between its pages, so a check here would be skipped exactly when it matters. `/saved`
 * is also open to guests, whose saves live on the device.
 */
export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <StorefrontChrome search>
      <div className="container grid gap-6 py-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </StorefrontChrome>
  )
}
