import localFont from "next/font/local"

/**
 * The storefront's two faces, from the files committed in @effy/design-system — not a copy.
 *
 * `next/font` does what the plain @font-face it replaced could not: it preloads Geist (every page
 * renders text in it) and declares a fallback face sized to Geist's metrics, so the first paint in
 * the fallback occupies the same space and the swap moves nothing. The design system's font tokens
 * read the two variables set here.
 *
 * Geist Mono is not preloaded: only offer codes and one-time-code fields use it, and a browser
 * downloads a face only when it renders glyphs in it — a page without one never fetches it.
 */
export const geist = localFont({
  src: "../../../packages/design-system/src/customer-web/fonts/Geist-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-geist",
  adjustFontFallback: "Arial",
})

export const geistMono = localFont({
  src: "../../../packages/design-system/src/customer-web/fonts/GeistMono-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-geist-mono",
  preload: false,
  adjustFontFallback: false,
})
