import {
  CircleHelp,
  Coins,
  CreditCard,
  FileText,
  Heart,
  House,
  Lock,
  MapPin,
  Package,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

/**
 * The customer's account destinations — one list, rendered by two different controls.
 *
 * It exists because the same entries are shown in two places that look nothing alike: the desktop
 * dropdown (`AccountMenu`) and the phone menu's account panel (`MobileNavIsland`). Written out twice,
 * they drift — a link added for the desktop menu simply never appears on a phone, and nothing fails.
 *
 * The glyph is part of the entry, not of the renderer, for the same reason.
 *
 * `group` splits the list where the reference draws its separator: account destinations, then help.
 *
 * Sign-out is deliberately not in here. It is a `<form method="post">`, not a link (a GET sign-out is
 * triggerable by any `<img src="/sign-out">` on the internet — a CSRF logout), so it has a different
 * shape and belongs to each renderer.
 */
export const ACCOUNT_LINKS: ReadonlyArray<{
  label: string
  href: string
  testId: string
  Icon: LucideIcon
  group: "account" | "help"
}> = [
  { label: "Your account", href: "/account", testId: "menu-account", Icon: UserRound, group: "account" },
  { label: "Orders", href: "/orders", testId: "menu-orders", Icon: Package, group: "account" },
  { label: "Saved items & lists", href: "/saved", testId: "menu-saved", Icon: Heart, group: "account" },
  { label: "Effy points", href: "/account/points", testId: "menu-points", Icon: Coins, group: "account" },
  { label: "Address book", href: "/addresses", testId: "menu-addresses", Icon: MapPin, group: "account" },
  { label: "Payment methods", href: "/account/payment", testId: "menu-payment", Icon: CreditCard, group: "account" },
  { label: "Help & feedback", href: "/help", testId: "menu-help", Icon: CircleHelp, group: "help" },
]

/**
 * Every section of the account area — one list again, for the same reason as above: the sidebar
 * (`AccountNav`, from `lg`) and the phone menu's account level (`MobileNavIsland`, below it) show the
 * same entries, and a section added to one must not go missing from the other.
 *
 * `exact` marks an entry whose path is also the prefix of others (`/account` vs `/account/points`),
 * so it is current only on its own page.
 */
export const ACCOUNT_SECTIONS: ReadonlyArray<{
  label: string
  href: string
  Icon: LucideIcon
  exact?: boolean
}> = [
  { label: "Overview", href: "/account", Icon: House, exact: true },
  { label: "Orders", href: "/orders", Icon: Package },
  { label: "Saved items & lists", href: "/saved", Icon: Heart },
  { label: "Effy points", href: "/account/points", Icon: Coins },
  { label: "Personal info", href: "/account/personal", Icon: UserRound },
  { label: "Address book", href: "/addresses", Icon: MapPin },
  { label: "Payment methods", href: "/account/payment", Icon: CreditCard },
  { label: "Security", href: "/account/security", Icon: Lock },
  { label: "Privacy & data", href: "/account/privacy", Icon: ShieldCheck },
  { label: "Legal", href: "/account/legal", Icon: FileText },
]
