import type { Metadata } from "next"
import Link from "next/link"
import { Display } from "@/components/storefront/kit"

export const metadata: Metadata = {
  title: "Account unavailable",
  robots: { index: false, follow: false },
}

/**
 * Where a customer lands when the platform will not serve them: barred, or the account service is down.
 * The page does not distinguish them (that would leak account state) and does not sign them out (a
 * barred customer's credential is still valid).
 */
export default function AccountUnavailablePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
      <Display as="h1" size="section">
        We can&apos;t open your account right now
      </Display>
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
