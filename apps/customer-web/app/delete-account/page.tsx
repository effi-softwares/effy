import type { Metadata } from "next"
import Link from "next/link"

import { GuestDataControl } from "./GuestDataControl"

export const metadata: Metadata = {
  title: "Delete your Effy account",
  description:
    "How to permanently delete your Effy account and the personal data associated with it.",
}

/**
 * THE PUBLIC ACCOUNT-DELETION RESOURCE (034 FR-050 / FR-050a).
 *
 * ⚠ GOOGLE PLAY REQUIRES THIS AND APPLE DOES NOT — which is exactly why it gets skipped, and why a
 * missing or invalid deletion link is the most-reported Play rejection in this area. Google's User
 * Data policy requires a readily discoverable option to initiate deletion "from within your app AND
 * OUTSIDE of your app", declared in the Play Console Data safety form.
 *
 * ⚠ IT MUST WORK FOR SOMEONE WHO HAS UNINSTALLED THE APP (FR-050a). Google's three stated criteria
 * are that the link be FUNCTIONAL (loads without error), RELEVANT IN SCOPE (the deletion path is
 * prominently featured on the page), and that it REFERENCE THE APP OR DEVELOPER NAME. All three are
 * satisfied here. Signing in on the web is acceptable — a customer can do that without the app; the
 * failure mode to avoid is a page whose only route to deletion needs something the app alone can give.
 *
 * ⚠ THIS ROUTE IS PUBLIC AND THEREFORE IN THE GUEST BUNDLE GATE. It is listed in
 * `scripts/bundle-budget.mjs` in the same change that created it (FR-058c) — the file's own comments
 * record a public route that sat 58.8 KB over budget for two features because it was never listed.
 *
 * ⚠ Deliberately `/delete-account`, NOT `/account/delete`: the latter would put one URL subtree
 * across two route groups with different layouts and different auth posture, so a guard later added
 * to the `(account)` layout would silently fail to cover it.
 */
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Delete your Effy account</h1>

      <p className="mt-4 text-sm text-muted-foreground">
        You can permanently delete your Effy account and the personal data associated with it. You do
        not need the Effy app installed to do this.
      </p>

      {/* The deletion path, prominently featured — Google's "relevant in scope" criterion. */}
      <div className="mt-8 border-y py-6">
        <h2 className="text-lg font-medium">How to delete your account</h2>
        <ol className="mt-3 space-y-2 text-sm">
          <li>
            1. Sign in to your Effy account, then go to{" "}
            <Link href="/account?tab=privacy" className="font-medium underline">
              Account → Privacy &amp; data → Delete account
            </Link>
            .
          </li>
          <li>2. We&rsquo;ll email you a code to confirm it&rsquo;s really you.</li>
          <li>3. Enter the code to confirm. Your account is closed straight away.</li>
        </ol>

        <Link
          href="/account?tab=privacy"
          className="mt-6 inline-flex min-h-[48px] items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Delete my Effy account
        </Link>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-medium">What is deleted, and what we keep</h2>
        <p className="text-sm text-muted-foreground">
          Deleting removes your account, your saved items, your saved addresses and your personal
          details.
        </p>
        <p className="text-sm text-muted-foreground">
          We keep completed orders and payment records, because tax and accounting rules require it,
          and fraud and security signals that protect other customers. These are retained under the
          terms set out in our{" "}
          <Link href="/legal/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
        {/* ⚠ The exact retention window stated to a customer is set by the app's deletion flow, which
            reads it from the platform rather than repeating it here — one number, one source. */}
        <p className="text-sm text-muted-foreground">
          If you have an order in progress, you&rsquo;ll be asked to wait until it&rsquo;s complete
          before deleting.
        </p>
      </section>

      {/* FR-046 — the guest's route. See the component for why it lives on the PUBLIC page. */}
      <GuestDataControl />

      <section className="mt-8">
        <h2 className="text-lg font-medium">Need help?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Email{" "}
          <a href="mailto:support@effyshopping.com" className="underline">
            support@effyshopping.com
          </a>{" "}
          and we&rsquo;ll help you.
        </p>
      </section>
    </main>
  )
}
