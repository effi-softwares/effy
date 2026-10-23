import { permanentRedirect } from "next/navigation"

/** The old favourites address: a permanent redirect, so bookmarks and crawlers land on saved items. */
export default function RetiredFavoritesPage(): never {
  permanentRedirect("/saved")
}
