import type { Metadata } from "next"

import "./globals.css"
import { ThemeScript } from "@/components/theme/ThemeScript"
import { cn } from "@/lib/utils"
import { siteUrl } from "@/lib/config"

/*  ⚠⚠  TWO RULES GOVERN THIS FILE. BREAKING EITHER IS SILENT AND EXPENSIVE.  ⚠⚠

    1. NEVER call cookies() or headers() here — nor anywhere above a <Suspense> boundary.
       Reading a request API at this level defers the ENTIRE APP to request time: every page
       loses its static shell, and the speed and search visibility this surface exists for go
       with it. The personalized header (cart badge / "Hi <name>") is NOT read here — it is a
       streamed server island inside <Suspense>. See components/header/UserIsland.tsx.

    2. NEVER import `aws-amplify` — nor anything that transitively imports it — from this file.
       The root layout is on every route, so a client module imported here lands in the SHARED
       client chunk that EVERY page loads, including guest pages. Amplify's own docs tell you to
       call Amplify.configure() in the root layout; for a storefront with anonymous browsing that
       is exactly wrong. The SDK is configured in app/(auth)/layout.tsx and nowhere else.

    Both rules are machine-enforced — (1) by `cacheComponents` (a build error) and (2) by
    .dependency-cruiser.cjs (a build failure). They are written out here because a guard tells
    you that you broke a rule, never why the rule exists.                                       */

// ⚠ THE TYPEFACE IS NO LONGER WIRED HERE. General Sans (constitution Principle V, v1.11.0) is NOT on
// Google Fonts and has no @fontsource package, so `next/font/google` cannot resolve it. It is
// self-hosted from WOFF2 committed in @effy/design-system and declared by @font-face in tokens.css,
// which globals.css imports — so all three web surfaces get it from one place (Principle II) and this
// file needs no font config at all.
//
// ⚠ TRADEOFF, recorded rather than hidden: next/font/google supplied a metric-matched fallback
// (`size-adjust`) that eliminated swap-induced layout shift. A plain @font-face with `font-display:
// swap` does not. The faces are small (~23 KB each) and same-origin so the swap window is short, but
// if CLS regresses on the storefront the fix is `next/font/local` pointing at those same WOFF2 files
// with `adjustFontFallback` — NOT a second copy of the font.

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
  // 024: the name iOS shows under a home-screen web clip. This MUST be expressed as metadata —
  // `next/head` is a Pages Router API and is INERT in the App Router, so a <Head> block here
  // renders nothing at all and the tag never reaches the document.
  appleWebApp: { title: "Effy", capable: true, statusBarStyle: "default" },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", "font-sans")}
    >
      <body>
        {/* ⚠ FIRST child of <body>, and it must stay first: it applies the stored appearance before
            the browser paints anything below it. Move it lower and a dark-mode visitor gets a white
            flash on every navigation to a fresh document. */}
        <ThemeScript />
        {children}
      </body>
    </html>
  )
}
