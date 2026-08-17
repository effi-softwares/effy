import { pageSurface } from "@/components/storefront/kit"

import { CheckoutFooter } from "../checkout/_components/CheckoutFooter"
import { CheckoutHeader } from "../checkout/_components/CheckoutHeader"

/**
 * The FEEDBACK shell (046) — the SAME minimal, distraction-free chrome as checkout
 * (`CheckoutHeader` + `CheckoutFooter`), on operator direction: the feedback page is reached from the
 * checkout header and should sit in that same focused shell, not the full storefront chrome.
 *
 * Full-height flex column so the footer sits at the bottom on a short page and the content fills the
 * viewport (`min-h-svh`). Like the checkout layout, there is no auth check here — the page is
 * guest-first and reads the session only to prefill.
 */
export default function FeedbackLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`flex min-h-svh flex-col ${pageSurface}`}>
      {/* No "give us feedback" prompt here — it would link the feedback page to itself. */}
      <CheckoutHeader showFeedbackPrompt={false} />
      <main className="flex-1">{children}</main>
      <CheckoutFooter />
    </div>
  )
}
