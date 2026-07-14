import Link from "next/link"

import { ConfigureAmplify } from "./ConfigureAmplify"

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
    <div className="flex min-h-svh flex-col">
      <ConfigureAmplify />

      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Effy home">
            <span className="inline-block size-6 rounded-md bg-primary" aria-hidden="true" />
            <span className="text-lg font-semibold tracking-tight">Effy</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  )
}
