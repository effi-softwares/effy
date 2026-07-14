import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Account unavailable",
  robots: { index: false, follow: false },
}

/**
 * Where a customer lands when the platform will not serve them.
 *
 * ⚠ Two very different situations end up here, and the page DELIBERATELY DOES NOT DISTINGUISH THEM:
 *
 *   1. The customer's record is marked `barred` (FR-025).
 *   2. The account service is unreachable.
 *
 * Telling someone "your account has been barred" is an information leak they cannot act on, and it
 * hands an attacker a probe for account state. Telling a barred customer "we're having technical
 * difficulties" would be a lie. So the page says what is true of both: we can't get to your account
 * right now, here is how to reach a human.
 *
 * Note it does NOT sign them out. A barred customer still holds a valid credential — that is the
 * entire point of FR-025 — and pretending otherwise would just send them round the sign-in loop.
 */
export default function AccountUnavailablePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        We can&apos;t open your account right now
      </h1>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">
        Something is stopping us from loading your account. If this keeps happening, get in touch
        and we&apos;ll sort it out.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-md border px-6 text-sm font-medium hover:bg-accent"
        >
          Back to the store
        </Link>
      </div>
    </div>
  )
}
