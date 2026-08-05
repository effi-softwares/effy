import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { requireCustomer } from "@/lib/dal"
import { DeleteAccountFlow } from "./DeleteAccountFlow"

export const metadata: Metadata = {
  title: "Privacy & data",
  // Never indexed. An account page in a search index is a data leak with a URL.
  robots: { index: false, follow: false },
}

/**
 * Privacy & data (034 US6) — and the host for account deletion.
 *
 * ⚠ THE DELETION CONTROL IS THE LAST THING ON THE PAGE (FR-039), deliberately, and one navigation
 * level deep. Both stores name "account settings" as the canonical home and Apple's guidance warns
 * against burying the link; `Account → Privacy & data → bottom` matches the VERIFIED Uber path
 * (`Account → Settings → Privacy → Account Deletion`). SC-007 makes a fresh-account reviewer the test
 * rather than our own confidence.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy &amp; data</h1>

      <section className="mt-8" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className="text-lg font-medium">
          Privacy
        </h2>
        <ul className="mt-2 divide-y border-y">
          {/* ⚠ FR-052 — an in-app privacy policy link is required by BOTH stores, not just in the
              store listing. ⚠ FR-052a — the documents behind these links are operator-owned and
              legally reviewed; see SUBMISSION-BLOCKERS.md. */}
          <li>
            <Link
              href="/legal/privacy"
              className="flex min-h-[48px] items-center py-3 text-sm hover:text-foreground/70"
            >
              Privacy policy
            </Link>
          </li>
          <li>
            <Link
              href="/legal/terms"
              className="flex min-h-[48px] items-center py-3 text-sm hover:text-foreground/70"
            >
              Terms of service
            </Link>
          </li>
        </ul>
      </section>

      {/* The LAST item on the page. */}
      <section className="mt-16" aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="text-lg font-medium">
          Delete account
        </h2>
        <Suspense fallback={<p className="mt-2 text-sm text-muted-foreground">Loading…</p>}>
          <DeleteSection />
        </Suspense>
      </section>
    </div>
  )
}

async function DeleteSection() {
  await requireCustomer("/account/privacy")
  return <DeleteAccountFlow />
}
