import type { Metadata } from "next"
import { Suspense } from "react"

import { AuthFormSkeleton } from "../_components/AuthFormSkeleton"
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
  return <AuthFormSkeleton title="Sign in to Effy" subtitle="It's good to see you again." google />
}
