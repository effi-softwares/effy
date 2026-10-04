import type { Metadata } from "next"
import { Suspense } from "react"

import { DEFAULT_LIST_ID } from "@effy/shared-types"

import { PageHeader } from "@/components/storefront/kit"
import { getSession, requireCustomer } from "@/lib/dal"

import { ListTabs } from "./ListTabs"
import { readList } from "./read-list"
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
  const { lists, items } = await readList(session?.accessToken, DEFAULT_LIST_ID)

  return (
    <>
      <ListTabs lists={lists} currentId={DEFAULT_LIST_ID} />
      <SavedList initial={items ?? []} listId={DEFAULT_LIST_ID} />
    </>
  )
}
