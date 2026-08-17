import Link from "next/link"

import { BrandMark } from "@/components/storefront/BrandMark"
import { pageSurface } from "@/components/storefront/kit"

/**
 * A minimal, distraction-free CHECKOUT header — deliberately NOT the storefront's `StorefrontChrome`.
 *
 * A payment page wants the opposite of a storefront: no search, no category nav, no footer links —
 * every one of those is an EXIT from the payment funnel. All this keeps is the Effy mark, so the
 * shopper can see they have not left the site, and a quiet invitation to share feedback on checkout.
 *
 * ⚠ `showFeedbackPrompt` is false when the same shell wraps the feedback page itself (046) — a link
 * inviting "give us feedback" on the feedback page would be self-referential.
 */
export function CheckoutHeader({ showFeedbackPrompt = true }: { showFeedbackPrompt?: boolean }) {
  return (
    <header className={`sticky top-0 z-40 border-b ${pageSurface}`}>
      <div className="container flex h-16 items-center justify-between gap-4">
        <BrandMark href="/" />

        {showFeedbackPrompt && (
          <p className="hidden text-sm text-muted-foreground sm:block">
            How do you like our checkout?{" "}
            <Link href="/feedback?from=checkout" className="font-medium text-primary hover:underline">
              Give us feedback
            </Link>
          </p>
        )}
      </div>
    </header>
  )
}
