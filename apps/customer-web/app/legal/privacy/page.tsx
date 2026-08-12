import { redirect } from "next/navigation"

/**
 * Legacy alias. The canonical route is /legal/privacy-policy (driven by @effy/legal-content). Existing
 * links (sign-up consent, account, delete-account) and any bookmarks keep working via this redirect.
 */
export default function PrivacyRedirect() {
  redirect("/legal/privacy-policy")
}
