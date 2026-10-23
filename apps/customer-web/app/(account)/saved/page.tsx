import type { Metadata } from "next"
import { Suspense } from "react"

import { DEFAULT_LIST_ID } from "@effy/shared-types"

import { SavedSkeleton } from "./SavedSkeleton"
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
    // `container` (80rem), not `max-w-2xl`: this is a product list, shown at the storefront's width.
    <div className="space-y-6">
      <Suspense fallback={<SavedSkeleton />}>
        <Saved />
      </Suspense>
    </div>
  )
}

async function Saved() {
  await requireCustomer("/saved")
  const session = await getSession()
  const { lists, items } = await readList(session, DEFAULT_LIST_ID)

  return (
    <>
      <ListTabs
        lists={lists}
        currentId={DEFAULT_LIST_ID}
        droppedCount={(items ?? []).filter((i) => i.priceDropped).length}
      />
      <SavedList initial={items ?? []} listId={DEFAULT_LIST_ID} />
    </>
  )
}
