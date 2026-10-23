import Link from "next/link"

import { BrandMark } from "@/components/storefront/BrandMark"
import { Suspense } from "react"
import { Lock } from "lucide-react"

import { CheckoutSteps } from "./CheckoutSteps"

/**
 * A minimal, distraction-free checkout header — deliberately not the storefront's `StorefrontChrome`.
 *
 * A payment page wants the opposite of a storefront: no search, no category nav, no footer links
 * every one of those is an exit from the payment funnel. All this keeps is the Effy mark, so the
 * shopper can see they have not left the site, and a quiet invitation to share feedback on checkout.
 *
 * `showFeedbackPrompt` is false when the same shell wraps the feedback page itself — a link
 * inviting "give us feedback" on the feedback page would be self-referential.
 */
export function CheckoutHeader({ showFeedbackPrompt = true }: { showFeedbackPrompt?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="container flex h-14 items-center justify-between gap-4 lg:h-16">
        <BrandMark href="/" className="max-lg:text-[22px]!" />
        {/* `usePathname` suspends while a dynamic route prerenders; the steps are decoration there. */}
        <Suspense fallback={null}>
          <CheckoutSteps />
        </Suspense>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock aria-hidden="true" className="size-4" />
          <span className="max-sm:sr-only">Secure checkout</span>
        </span>
      </div>
      {showFeedbackPrompt && (
        <p className="sr-only">
          How do you like our checkout? <Link href="/help?from=checkout">Give us feedback</Link>
        </p>
      )}
    </header>
  )
}
