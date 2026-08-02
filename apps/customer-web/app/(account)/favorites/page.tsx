import { permanentRedirect } from "next/navigation"

/**
 * The retired favourites address (033 FR-004).
 *
 * ⚠ A REDIRECT, NOT A 404. The predecessor's page lived here and was linked from the storefront
 * footer, so shoppers hold bookmarks and search engines hold the URL. Answering "not found" for a
 * page that moved is a dead end for exactly the people who used the feature most.
 *
 * `permanentRedirect` (308) rather than a temporary one: the old address is gone for good, and a
 * permanent answer lets a crawler forget it rather than re-checking forever.
 */
export default function RetiredFavoritesPage(): never {
  permanentRedirect("/saved")
}
