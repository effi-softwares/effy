import { redirect } from "next/navigation"

/**
 * Legacy alias. The canonical route is /legal/terms-of-service (driven by @effy/legal-content).
 * Existing links (sign-up consent, account) and any bookmarks keep working via this redirect.
 */
export default function TermsRedirect() {
  redirect("/legal/terms-of-service")
}
