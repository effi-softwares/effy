import type { Metadata } from "next"
import { Suspense } from "react"

import { SignInForm } from "./SignInForm"

export const metadata: Metadata = {
  title: "Sign in",
  // Not a page we want in a search index — robots.txt disallows it too.
  robots: { index: false, follow: false },
}

/**
 * ⚠ NO `next/dynamic({ ssr: false })` here — Next 16 forbids it in a Server Component ("`ssr: false`
 * is not allowed with `next/dynamic` in Server Components"). It is also unnecessary: `SignInForm`
 * is a Client Component, so Next already emits it — and everything it imports, including the Amplify
 * SDK — as a chunk belonging to THIS ROUTE SEGMENT. Guest pages never load it.
 *
 * That route-group split is the whole quarantine, and it is enforced by .dependency-cruiser.cjs.
 *
 * <Suspense> is required because the form reads `useSearchParams` (the `next` destination).
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <SignInForm />
    </Suspense>
  )
}

function FormSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="space-y-4">
        <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  )
}
