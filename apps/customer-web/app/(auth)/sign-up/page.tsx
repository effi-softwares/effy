import type { Metadata } from "next"
import { Suspense } from "react"

import { AuthFormSkeleton } from "../_components/AuthFormSkeleton"
import { SignUpForm } from "./SignUpForm"

export const metadata: Metadata = {
  title: "Create your account",
  // Not a page we want in a search index - robots.txt disallows it too.
  robots: { index: false, follow: false },
}

/**
 * No `next/dynamic({ ssr: false })` (Next 16 forbids it in a Server Component, and the form is a Client
 * Component, so it and the Amplify SDK are this segment's chunk anyway). <Suspense> because the form
 * reads `useSearchParams`.
 */
export default function SignUpPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <SignUpForm />
    </Suspense>
  )
}

function FormSkeleton() {
  return <AuthFormSkeleton title="Create your account" subtitle="Start with your email - we'll do the rest in a moment." google />
}
