import type { Metadata } from "next"
import { Suspense } from "react"

import { UnsubscribeOutcome, UnsubscribeSkeleton } from "./UnsubscribeOutcome"

/**
 * `/email/unsubscribe?t=…&m=…` - the unsubscribe link in a marketing email (115 US2).
 *
 * The server render changes nothing: the client component posts once the page has loaded, because mail scanners open
 * links before people do and would otherwise unsubscribe them. Noindex: every URL carries a live token.
 */
export const metadata: Metadata = {
  title: "Email preferences - Effy",
  robots: { index: false, follow: false },
}

export default function EmailUnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; m?: string }> }) {
  return (
    <div className="container py-10">
      <div className="mx-auto max-w-120 py-12">
        <Suspense fallback={<UnsubscribeSkeleton />}>
          <Outcome searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}

async function Outcome({ searchParams }: { searchParams: Promise<{ t?: string; m?: string }> }) {
  const { t, m } = await searchParams
  return <UnsubscribeOutcome token={t ?? ""} messageId={m ?? null} />
}
