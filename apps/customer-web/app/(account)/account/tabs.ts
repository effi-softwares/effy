/**
 * The account page's tab vocabulary.
 *
 * ⚠ NO `"use client"` — this module is imported by BOTH the server page and the client navigation,
 * and it must stay that way. It holds no state and touches no browser API precisely so the two
 * halves cannot drift on what a tab is called or what URL it lives at.
 */

/** The tabs that live INSIDE the content area (not separate pages). */
export type AccountTab =
  | "personal"
  | "addresses"
  // 051 US6 — payment methods sit beside the address book, because that is where a shopper looks for
  // them and because the two are the same kind of thing: saved details Effy uses on their behalf.
  | "payment"
  | "security"
  | "privacy"
  | "legal"

export const TABS: readonly AccountTab[] = [
  "personal",
  "addresses",
  "payment",
  "security",
  "privacy",
  "legal",
]

export function parseTab(raw: string | undefined): AccountTab {
  return (TABS as readonly string[]).includes(raw ?? "") ? (raw as AccountTab) : "personal"
}

/** The URL for a tab — `personal` is the bare page; the rest carry `?tab=`. */
export function tabHref(tab: AccountTab): string {
  return tab === "personal" ? "/account" : `/account?tab=${tab}`
}
