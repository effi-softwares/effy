import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { DEFAULT_LIST_ID } from "@effy/shared-types"

import { PageHeader } from "@/components/storefront/kit"
import { getSession, requireCustomer } from "@/lib/dal"

import { ListTabs } from "../ListTabs"
import { readList } from "../read-list"
import { SavedList } from "../SavedList"

export const metadata: Metadata = {
  // ⚠ NOT the list's name. A name is the shopper's own text and may say anything about them; it
  // stays out of the document title, which browsers sync and history records (068 FR-040).
  title: "Saved items",
  robots: { index: false, follow: false },
}

/**
 * One of the shopper's own lists (068 FR-023). "Saved" itself lives at `/saved`.
 *
 * ⚠ `params` IS AWAITED INSIDE THE SUSPENSE BOUNDARY, not here. Awaiting it in the page component
 * makes the whole route block on uncached data and the production build refuses it
 * ("Uncached data was accessed outside of <Suspense>") — which typecheck and every test pass.
 */
export default function ListPage({ params }: { params: Promise<{ listId: string }> }) {
  return (
    <div className="container py-8">
      <PageHeader title="Saved items" />
      <Suspense fallback={<p className="py-10 text-sm text-muted-foreground">Loading…</p>}>
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
      <ListTabs lists={lists} currentId={listId} />
      {/* `key`: moving between two named lists reuses this route segment, and the rows are state. */}
      <SavedList key={listId} initial={items} listId={listId} />
    </>
  )
}
