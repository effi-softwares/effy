/**
 * The account area's sections and where each lives.
 *
 * ⚠ NO `"use client"` — imported by server pages and by the client navigation link alike.
 *
 * Until 084 these were tabs of `/account`, addressed `?tab=<name>`. Each is now a page. `parseTab`
 * and `tabHref` remain so an old `?tab=` link can be turned into its page (FR-014).
 */
export type AccountTab = "personal" | "addresses" | "payment" | "points" | "security" | "privacy" | "legal"

export const TABS: readonly AccountTab[] = ["personal", "addresses", "payment", "points", "security", "privacy", "legal"]

const HREF: Record<AccountTab, string> = {
  personal: "/account/personal",
  addresses: "/addresses",
  payment: "/account/payment",
  points: "/account/points",
  security: "/account/security",
  privacy: "/account/privacy",
  legal: "/account/legal",
}

/** A known section name, or null — an unknown `?tab=` is simply the Overview. */
export function parseTab(raw: string | undefined): AccountTab | null {
  return (TABS as readonly string[]).includes(raw ?? "") ? (raw as AccountTab) : null
}

export function tabHref(tab: AccountTab): string {
  return HREF[tab]
}
