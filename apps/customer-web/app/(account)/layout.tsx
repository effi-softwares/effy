import { StorefrontChrome } from "@/app/(shop)/_components/StorefrontChrome"
import { AccountNav } from "@/components/chrome/AccountNav"

/**
 * The account area's frame: header, footer and a sidebar of sections (Orders and Saved included); below
 * `lg` the sections are in the menu drawer. Each page guards itself (`requireCustomer`): a layout does
 * not re-run between its pages. `/saved` is open to guests.
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
