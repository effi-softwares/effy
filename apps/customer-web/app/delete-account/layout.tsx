import { StorefrontChrome } from "@/app/(shop)/_components/StorefrontChrome"

/** Information pages sit inside the ordinary storefront: the header, the cart and the footer stay. */
export default function InfoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <StorefrontChrome search>{children}</StorefrontChrome>
}
