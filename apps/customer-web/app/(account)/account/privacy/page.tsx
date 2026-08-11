import { redirect } from "next/navigation"

/**
 * Privacy & data moved INTO the account page as its `privacy` tab (2026-08-12) — the privacy links
 * and the account-deletion flow now swap into the account content area rather than living on a
 * separate page. This route is kept so existing links and bookmarks land in the right place.
 */
export default function PrivacyPage() {
  redirect("/account?tab=privacy")
}
