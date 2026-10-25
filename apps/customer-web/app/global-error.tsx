"use client"

import "./globals.css"

/**
 * The last resort: the root layout itself failed, so there is no storefront to draw this inside
 * (reference: Help & info · Error). It brings its own <html> and <body> and loads nothing it does not
 * need — a page that exists because something broke must not depend on the thing that broke.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto max-w-130 space-y-4 px-4 py-24 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Something went wrong on our side</h1>
          <p className="text-base text-muted-foreground">It&apos;s not you. Please try again in a moment.</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
            {/* A full page load, on purpose: the app's own router is part of what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium">
              Go to the home page
            </a>
          </div>
          {error.digest && <p className="pt-4 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  )
}
