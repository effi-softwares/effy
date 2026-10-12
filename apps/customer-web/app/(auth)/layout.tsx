import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { btnClass } from "@/components/storefront/actions"
import { BrandMark } from "@/components/storefront/BrandMark"

import { AuthAside } from "./_components/AuthAside"
import { ConfigureAmplify } from "./ConfigureAmplify"

/**
 * The sign-in / join / reset frame (reference: Shared components · Auth card template).
 *
 * TWO HALVES from `lg`: the art panel on the left, and on the right the wordmark, a way back to the
 * store and ONE 400px column, centred, that every step of every flow renders into. Below `lg` the
 * art panel is gone and the column has the screen. Which step is the page's business — the frame
 * never changes.
 *
 * ⚠ `ConfigureAmplify` is mounted HERE and nowhere else — the auth SDK must not reach the guest
 * bundle (see app/layout.tsx, rule 2).
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <ConfigureAmplify />
      <AuthAside />
      <div className="flex min-w-0 flex-1 basis-1/2 flex-col">
        <header className="flex items-center justify-between gap-3 px-6 py-6 sm:px-8">
          <BrandMark size={26} />
          <Link href="/" className={btnClass("ghost", "sm")}>
            <ArrowLeft aria-hidden="true" />
            Back to the store
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 pt-8 pb-24">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
