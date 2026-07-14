import type { Metadata } from "next"
import { Suspense } from "react"

import { CallbackHandler } from "./CallbackHandler"

export const metadata: Metadata = {
  title: "Signing you in",
  robots: { index: false, follow: false },
}

export default function CallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  )
}
