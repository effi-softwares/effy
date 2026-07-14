"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Dark mode (constitution Principle V — REQUIRED on every surface).
 *
 * `attribute="class"` matches the design system's `.dark` convention, and next-themes writes the
 * class before paint, so there is no flash of the wrong theme on an SSR page.
 *
 * ⚠ REMOVED: the shadcn preset scaffolded a global "press D to toggle the theme" hotkey here. Two
 * reasons it is gone, and it should not come back:
 *
 *   1. IT CRASHED. It read `event.key.toLowerCase()`, but `event.key` is `undefined` for the
 *      synthetic keydown events browsers dispatch during PASSWORD-MANAGER AUTOFILL and IME
 *      composition — so it threw a TypeError on the sign-up form, of all places, for anyone using a
 *      password manager. A `typeof event.key === "string"` guard would have silenced it.
 *
 *   2. Silencing it would have been the wrong fix. This is a PUBLIC STOREFRONT, not a component
 *      gallery. A bare single-letter global shortcut means a customer who presses `d` while
 *      scrolling — or whose screen reader sends a key event — has the whole site flip appearance
 *      under them. Neither back-office nor shop-web has such a binding. The preset's default made
 *      sense for a demo; it does not make sense here.
 *
 * If a theme toggle is wanted, it belongs in the header as a visible, labelled control — not as an
 * invisible keystroke.
 */
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
