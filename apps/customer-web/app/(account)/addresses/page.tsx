import { redirect } from "next/navigation"

/**
 * The address book moved INTO the account page as its `addresses` tab (2026-08-12) — managing
 * addresses no longer leaves the account hub. This route is kept only so existing links and
 * bookmarks (checkout's "manage addresses", the footer, older emails) land in the right place.
 */
export default function AddressesPage() {
  redirect("/account?tab=addresses")
}
