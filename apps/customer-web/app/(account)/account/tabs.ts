/**
 * The account area's sections and where each lives. No `"use client"`: server pages and the client link
 * both import it. `parseTab` and `tabHref` turn an old `?tab=` link into its page.
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

/** A known section name, or null - an unknown `?tab=` is simply the Overview. */
export function parseTab(raw: string | undefined): AccountTab | null {
  return (TABS as readonly string[]).includes(raw ?? "") ? (raw as AccountTab) : null
}

export function tabHref(tab: AccountTab): string {
  return HREF[tab]
}
