import type { Metadata } from "next"
import { Nunito_Sans } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
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

// next/font self-hosts at build time: no request to fonts.gstatic.com, no third-party origin on
// the critical path, no preconnect needed, and a metric-matched fallback that eliminates
// swap-induced layout shift. One family, one variable. Nunito Sans is the brand typeface (constitution
// Principle V, v1.10.0); the design system's --font-sans token references "Nunito Sans" first.
const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

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
      className={cn("antialiased", nunitoSans.variable, "font-sans")}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
