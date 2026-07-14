import type { Metadata } from "next"
import { Suspense } from "react"

import { SignUpForm } from "./SignUpForm"

export const metadata: Metadata = {
  title: "Create your account",
  // Not a page we want in a search index — robots.txt disallows it too.
  robots: { index: false, follow: false },
}

/**
 * ⚠ NO `next/dynamic({ ssr: false })` here — Next 16 forbids it in a Server Component ("`ssr: false`
 * is not allowed with `next/dynamic` in Server Components"). It is also unnecessary: `SignUpForm`
 * is a Client Component, so Next already emits it — and everything it imports, including the Amplify
 * SDK — as a chunk belonging to THIS ROUTE SEGMENT. Guest pages never load it.
 *
 * That route-group split is the whole quarantine, and it is enforced by .dependency-cruiser.cjs.
 *
 * <Suspense> is required because the form reads `useSearchParams` (the `next` destination).
 */
export default function SignUpPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <SignUpForm />
    </Suspense>
  )
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
      <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
    </div>
  )
}
