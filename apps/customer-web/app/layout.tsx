import type { Metadata } from "next"

import "./globals.css"
import { cn } from "@/lib/utils"
import { geist, geistMono } from "./fonts"
import { siteUrl } from "@/lib/config"
// The telemetry client island (consent + analytics + error tracking). It imports NO auth SDK and
// NO analytics SDK at module scope (both are dynamically imported), so it is safe here per the two
// rules above: it never drags aws-amplify into the shared chunk and needs no request API.
import { TelemetryBootClient } from "@/app/_components/TelemetryBootClient"

/*  two rules govern this file. Breaking either is silent and expensive.

    1. Never call cookies or headers here — nor anywhere above a <Suspense> boundary.
       Reading a request API at this level defers the entire app to request time: every page
       loses its static shell, and the speed and search visibility this surface exists for go
       with it. The personalized header (cart badge / "Hi <name>") is not read here — it is a
       streamed server island inside <Suspense>. See components/header/UserIsland.tsx.

    2. Never import `aws-amplify` — nor anything that transitively imports it — from this file.
       The root layout is on every route, so a client module imported here lands in the shared
       client chunk that every page loads, including guest pages. Amplify's own docs tell you to
       call Amplify.configure in the root layout; for a storefront with anonymous browsing that
       is exactly wrong. The SDK is configured in app/(auth)/layout.tsx and nowhere else.

    Both rules are machine-enforced — (1) by `cacheComponents` (a build error) and (2) by
    .dependency-cruiser.cjs (a build failure). They are written out here because a guard tells
    you that you broke a rule, never why the rule exists.                                       */

// The typeface: Geist, through `next/font/local` (./fonts.ts) from the files committed in
// @effy/design-system — preloaded, with a metric-matched fallback so the swap shifts nothing.
// The class on <html> below sets the variables the design system's font tokens read.

export const metadata: Metadata = {
  // Every relative canonical/OG url in the app resolves against this.
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Effy — groceries, delivered",
    template: "%s · Effy",
  },
  description:
    "Shop fresh groceries and everyday essentials from Effy, delivered to your door.",
  openGraph: { type: "website", siteName: "Effy" },
  twitter: { card: "summary_large_image" },
  // The name iOS shows under a home-screen web clip. This must be expressed as metadata
  // `next/head` is a Pages Router API and is inert in the App Router, so a <Head> block here
  // renders nothing at all and the tag never reaches the document.
  appleWebApp: { title: "Effy", capable: true, statusBarStyle: "default" },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // Customer storefront is light-only (operator decision). Unlike the internal consoles, this
    // public surface ships no appearance switcher and never applies the design system's `.dark`
    // class, so every page renders on the light `:root` tokens. `color-scheme: light` is pinned in
    // globals.css so form controls, scrollbars and the address bar stay light even on an OS set to
    // dark — otherwise the browser would render native chrome dark over a light page.
    <html lang="en" className={cn("antialiased", "font-sans", geist.variable, geistMono.variable)}>
      <body>
        {children}
        <TelemetryBootClient />
      </body>
    </html>
  )
}
