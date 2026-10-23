import type { Metadata } from "next"
import { Suspense } from "react"

import { SignInForm } from "./SignInForm"

export const metadata: Metadata = {
  title: "Sign in",
  // Not indexed; robots.txt disallows it too.
  robots: { index: false, follow: false },
}

/**
 * No `next/dynamic({ ssr: false })` (Next 16 forbids it in a Server Component, and the form is a Client
 * Component, so it and the Amplify SDK are this segment's chunk anyway). <Suspense> because the form
 * reads `useSearchParams`.
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
