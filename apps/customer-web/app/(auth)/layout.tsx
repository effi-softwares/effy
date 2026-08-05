import Link from "next/link"

import { pageSurface } from "@/components/storefront/kit"

import { ConfigureAmplify } from "./ConfigureAmplify"
import { BrandMark } from "@/components/storefront/BrandMark"

/**
 * The (auth) route group — sign-in, sign-up, and the OAuth callback.
 *
 * These pages are PUBLIC (a guest must be able to reach sign-up), but they are the only pages in
 * the application that load the authentication SDK. That containment is the whole reason this
 * route group exists.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`flex min-h-svh flex-col ${pageSurface}`}>
      <ConfigureAmplify />

      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6">
          <BrandMark />
        </div>
      </header>

      {/*
        ⚠ STRETCH ON A PHONE, CENTRE ON A DESKTOP. The step screens put their footer link — and on
        single-action steps their primary button — at the BOTTOM of the screen, which needs the column
        to actually fill the viewport. `items-center` collapsed it to its content height, so "bottom"
        meant "just under the last field".

        Centring is still right on a large window, where a full-height column would strand the footer
        hundreds of pixels below the form. Hence the breakpoint rather than a blanket change.
      */}
      <main className="flex flex-1 flex-col px-4 py-8 sm:items-center sm:justify-center sm:py-12">
        <div className="flex w-full max-w-sm flex-1 flex-col sm:block sm:flex-none">{children}</div>
      </main>
    </div>
  )
}
