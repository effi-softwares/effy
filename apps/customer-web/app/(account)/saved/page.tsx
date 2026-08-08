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
    // ⚠ This page had NO content column at all — it rendered edge-to-edge with no gutter, so on a
    // phone the list ran into both screen edges. It was invisible under the old account layout only
    // because that chrome was equally bare; against the real storefront header it reads as broken.
    //
    // `container` (80rem), not the `max-w-2xl` the other account pages use: those are forms and
    // settings, where a narrow measure is correct. This is a LIST of products with prices and
    // verdicts, and it is the same content the storefront lists at full width.
    <div className="container py-8">
      <PageHeader title="Saved items" />
      <Suspense fallback={<p className="py-10 text-sm text-muted-foreground">Loading…</p>}>
        <Saved />
      </Suspense>
    </div>
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
