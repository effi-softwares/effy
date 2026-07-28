"use client"

import * as React from "react"

import { setAppearance, useAppearance } from "./appearance-store"

import { cn } from "@/lib/utils"

/* Inline SVGs (not lucide-react): this control is on the GUEST first-load path, whose byte budget is
   a hard build gate. Three hand-inlined icons cost a few bytes; pulling lucide onto the guest path
   cost ~9 KB and left almost no headroom. Same guest-discipline reasoning as UserIsland/AccountMenu. */
type IconProps = { className?: string }
const SunIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
)
const MoonIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
)
const MonitorIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
)

/**
 * The visible, labelled appearance switcher (017 US2 / FR-009).
 *
 * The hard parts live elsewhere: `appearance-store.ts` owns persistence, `system` tracking and
 * cross-tab sync, and `ThemeScript.tsx` runs before paint so there is no flash of the wrong theme.
 * This component is only the CONTROL. It calls `setAppearance` and nothing else.
 *
 * ⚠ The old single-letter "press D to toggle" hotkey is NOT coming back. It crashed on
 * password-manager autofill (`event.key` is `undefined` for those synthetic events), and silencing
 * that would have been the wrong fix anyway: on a PUBLIC storefront, a bare unmodified letter key
 * means a shopper who presses `d` while scrolling flips the whole site's appearance under them.
 *
 * It is a small client island in the footer. It reads no cookies and imports no SDK, so it stays in
 * the static shell (it does not convert the page to request-time rendering) and never touches the
 * Amplify quarantine.
 *
 * ⚠ No `mounted` flag. `useSyncExternalStore` renders the server snapshot during hydration and
 * re-renders with the real value immediately after — which is the same effect the `mounted` dance
 * achieved, done by React rather than by hand.
 */
const MODES = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const

export function AppearanceControl({ className }: { className?: string }) {
  const appearance = useAppearance()

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      data-testid="appearance-control"
      className={cn("inline-flex items-center rounded-full border p-0.5", className)}
    >
      {MODES.map(({ value, label, Icon }) => {
        const active = appearance === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            data-testid={`appearance-${value}`}
            onClick={() => setAppearance(value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-primary text-primary-foreground hover:text-primary-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
