import type { Metadata } from "next"
import { Suspense } from "react"

import type { FavoriteDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"

import { FavoritesList } from "./FavoritesList"

export const metadata: Metadata = {
  title: "Your favourites",
  robots: { index: false, follow: false },
}

/** Favourites (US6). Saved products; add-to-cart or remove. Gated + request-time → Suspense. */
export default function FavoritesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your favourites</h1>
      <Suspense fallback={<div className="h-48 w-full animate-pulse rounded-lg bg-muted" />}>
        <Favorites />
      </Suspense>
    </div>
  )
}

async function Favorites() {
  await requireCustomer("/favorites")
  const session = await getSession()
  let favorites: FavoriteDTO[] = []
  if (session?.accessToken) {
    try {
      favorites = await coreApi(session.accessToken).get<FavoriteDTO[]>("/v1/favorites", uncached())
    } catch {
      favorites = []
    }
  }
  return <FavoritesList initial={favorites} />
}
