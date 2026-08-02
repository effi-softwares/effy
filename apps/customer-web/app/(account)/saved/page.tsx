import type { Metadata } from "next"
import { Suspense } from "react"

import type { SavedItemDTO } from "@effy/shared-types"

import { PageHeader } from "@/components/storefront/kit"
import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"

import { SavedList } from "./SavedList"

export const metadata: Metadata = {
  title: "Saved items",
  // Personal, so never indexed.
  robots: { index: false, follow: false },
}

export default function SavedPage() {
  return (
    <>
      <PageHeader title="Saved items" />
      <Suspense fallback={<p className="py-10 text-sm text-muted-foreground">Loading…</p>}>
        <Saved />
      </Suspense>
    </>
  )
}

async function Saved() {
  await requireCustomer("/saved")
  const session = await getSession()

  // ⚠ The shopper's CURRENT delivery location decides purchasability, and it lives in localStorage
  // (never a cookie — a cookie would cost every public page its static shell). The server therefore
  // cannot know it here, so this first read is location-less and every item comes back
  // "not yet determined"; SavedList re-reads with the postcode on mount. That is FR-038 working as
  // specified — the platform never claims an availability it has not checked.
  let items: SavedItemDTO[] = []
  try {
    items = await coreApi(session?.accessToken).get<SavedItemDTO[]>("/v1/saved", uncached())
  } catch {
    // A failed read renders the empty state rather than an error page — the next load repairs it.
  }

  return <SavedList initial={items} />
}
