import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { DEFAULT_LIST_ID } from "@effy/shared-types"

import { SavedSkeleton } from "../SavedSkeleton"
import { getSession, requireCustomer } from "@/lib/dal"

import { ListTabs } from "../ListTabs"
import { readList } from "../read-list"
import { SavedList } from "../SavedList"

export const metadata: Metadata = {
  // Not the list's name: it is the shopper's own text, and browsers sync titles.
  title: "Saved items",
  robots: { index: false, follow: false },
}

/**
 * One of the shopper's own lists ("Saved" is `/saved`). `params` is awaited inside the Suspense boundary:
 * awaiting it in the page blocks the route on uncached data, which the production build refuses.
 */
export default function ListPage({ params }: { params: Promise<{ listId: string }> }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SavedSkeleton />}>
        <List params={params} />
      </Suspense>
    </div>
  )
}

async function List({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params
  if (listId === DEFAULT_LIST_ID) redirect("/saved")

  await requireCustomer(`/saved/${listId}`)
  const session = await getSession()
  const { lists, items } = await readList(session, listId)

  // Deleted on another device, or never this shopper's: back to the list that always exists.
  const list = lists.find((l) => l.id === listId)
  if (items === null || !list) redirect("/saved")

  return (
    <>
      <ListTabs
        lists={lists}
        currentId={listId}
        droppedCount={(items).filter((i) => i.priceDropped).length}
      />
      {/* `key`: moving between named lists reuses this segment, and the rows are state. */}
      <SavedList key={listId} initial={items} listId={listId} />
    </>
  )
}
