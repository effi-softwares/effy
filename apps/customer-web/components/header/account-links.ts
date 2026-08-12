import { Heart, UserRound } from "lucide-react"
import type { LucideIcon } from "lucide-react"

/**
 * The customer's account destinations — ONE list, rendered by two different controls.
 *
 * ⚠ It exists because the same entries are now shown in two places that look nothing alike: the
 * desktop `<details>` dropdown (`AccountMenu`) and the drawer's slide-in account panel on small
 * screens (`MobileNavIsland`). Written out twice, they drift — a link added for the desktop menu
 * simply never appears on a phone, and nothing fails.
 *
 * ⚠ THE GLYPH IS PART OF THE ENTRY, not of the renderer. Both surfaces show an icon before the
 * label, and an icon chosen per-renderer is the same drift the list exists to prevent — with the
 * worse failure mode that the two would disagree about what a destination LOOKS like while agreeing
 * about where it goes. `lucide-react` is already on this path (the cart, the search field), so the
 * import adds no new dependency to the guest bundle.
 *
 * Sign-out is deliberately NOT in here. It is a `<form method="post">`, not a link (a GET sign-out is
 * triggerable by any `<img src="/sign-out">` on the internet — a CSRF logout), so it has a different
 * shape and belongs to each renderer.
 */
export const ACCOUNT_LINKS: ReadonlyArray<{
  label: string
  href: string
  testId: string
  Icon: LucideIcon
}> = [
  { label: "Your account", href: "/account", testId: "menu-account", Icon: UserRound },
  // Addresses are NOT listed here: they are a tab of the account page (`/account?tab=addresses`),
  // so "Your account" already leads there. Existing links to `/addresses` still redirect.
  // 033 FR-055: a storefront entry point that does not require scrolling to the footer.
  { label: "Saved items", href: "/saved", testId: "menu-saved", Icon: Heart },
]
