import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { BrandMark } from "@/components/storefront/BrandMark"

import { ConfigureAmplify } from "./ConfigureAmplify"

/**
 * The sign-in / join / reset frame (reference: Shared components · Auth card template).
 *
 * ONE centred card on a quiet grey page, the wordmark above it and a way back to the store. Every
 * step of every flow renders inside this same card — which step is the page's business, the frame
 * never changes.
 *
 * ⚠ From `sm` the card is a card. Below it the card has no border and fills the width: on a phone a
 * boxed form inside a 16px gutter wastes a fifth of the screen, and the steps anchor their committing
 * action to the bottom of the viewport (see `StepShell`), which needs the full height.
 *
 * ⚠ `ConfigureAmplify` is mounted HERE and nowhere else — the auth SDK must not reach the guest
 * bundle (see app/layout.tsx, rule 2).
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground sm:bg-muted">
      <ConfigureAmplify />
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <BrandMark size={22} />
        <Link
          href="/"
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to the store
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pb-10 sm:justify-center">
        <div className="flex w-full max-w-md flex-1 flex-col sm:flex-none sm:rounded-lg sm:border sm:bg-card sm:p-8 sm:shadow-xs">
          {children}
        </div>
      </main>
    </div>
  )
}
