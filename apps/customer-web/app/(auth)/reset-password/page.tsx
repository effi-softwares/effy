import type { Metadata } from "next"
import { Suspense } from "react"

import { AuthFormSkeleton } from "../_components/AuthFormSkeleton"
import { ResetPasswordForm } from "./ResetPasswordForm"

export const metadata: Metadata = {
  title: "Reset your password",
  // Not indexed; robots.txt disallows it too.
  robots: { index: false, follow: false },
}

/**
 * No `next/dynamic({ ssr: false })` (Next 16 forbids it in a Server Component, and the form is a Client
 * Component, so it and the Amplify SDK are this segment's chunk anyway). <Suspense> because the form
 * reads `useSearchParams`.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <ResetPasswordForm />
    </Suspense>
  )
}

function FormSkeleton() {
  return <AuthFormSkeleton title="Reset your password" subtitle="Enter your email and we'll send you a code to reset it." />
}
