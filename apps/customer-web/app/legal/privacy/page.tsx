import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Effy collects, uses and protects your personal information.",
}

/**
 * ⚠ THE ROUTE AND THE SHELL ONLY. THE CONTENT IS OPERATOR-OWNED (034 FR-052a).
 *
 * This page must exist and be publicly reachable: Apple 5.1.1(i) requires a privacy policy link
 * "within the app in an easily accessible manner", and Google requires an active, publicly
 * accessible, non-geofenced URL. But the words are a LEGAL DOCUMENT, not code.
 *
 * ⚠ PLACEHOLDER LEGAL TEXT WOULD BE WORSE THAN THIS NOTICE. FR-045 requires the retained-data
 * disclosure to be accurate, SC-010 requires every claim to be true of the built system, and Apple
 * has demonstrably demanded that developers cite the SPECIFIC LAW behind a retention claim.
 * Generated prose would put an unverified claim in front of a reviewer and a customer at once.
 *
 * Tracked as a store-submission blocker: specs/034-customer-account-center/SUBMISSION-BLOCKERS.md
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        This document is being prepared. It will describe what personal information Effy collects,
        how it is used, how long it is kept, and how to request its deletion.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        You can delete your account at any time from{" "}
        <a href="/delete-account" className="underline">
          Delete your Effy account
        </a>
        .
      </p>
    </main>
  )
}
