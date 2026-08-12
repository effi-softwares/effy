import { redirect } from "next/navigation"

/**
 * Security moved INTO the account page as its `security` tab (2026-08-12) — the password and
 * session controls now swap into the account content area rather than living on a separate page.
 * This route is kept so existing links and bookmarks land in the right place.
 */
export default function SecurityPage() {
  redirect("/account?tab=security")
}
