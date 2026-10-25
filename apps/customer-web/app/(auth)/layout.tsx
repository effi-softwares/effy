import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { btnClass } from "@/components/storefront/actions"
import { BrandMark } from "@/components/storefront/BrandMark"

import { AuthAside } from "./_components/AuthAside"
import { ConfigureAmplify } from "./ConfigureAmplify"

/**
 * The sign-in, join and reset frame: from `lg` the art panel beside the wordmark, a way back to the store
 * and one centred 400px column every step renders into; below `lg`, the column alone. `ConfigureAmplify`
 * is mounted here only, so the auth SDK never reaches the guest bundle.
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
          <div className="w-full max-w-100">{children}</div>
        </main>
      </div>
    </div>
  )
}
