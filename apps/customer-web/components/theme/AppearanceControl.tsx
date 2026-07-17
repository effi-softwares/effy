"use client"

import { useTheme } from "next-themes"
import * as React from "react"

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
 * next-themes (configured in components/theme-provider.tsx) already owns the hard parts — a
 * pre-paint script that avoids the flash of the wrong theme on an SSR page, `system` tracking, and
 * persistence. This component is only the CONTROL the storefront was missing (the old single-letter
 * hotkey was removed on purpose — see theme-provider.tsx). It calls `setTheme` and nothing else.
 *
 * It is a small client island in the header. It reads no cookies and imports no SDK, so it stays in
 * the static shell (it does not convert the page to request-time rendering) and never touches the
 * Amplify quarantine.
 *
 * `mounted` gates the active state: on the server we cannot know the resolved theme, so we render a
 * neutral control and light it up after hydration — the standard next-themes pattern that avoids a
 * hydration mismatch.
 */
const MODES = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const

export function AppearanceControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      data-testid="appearance-control"
      className={cn("inline-flex items-center rounded-full border p-0.5", className)}
    >
      {MODES.map(({ value, label, Icon }) => {
        const active = mounted && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            data-testid={`appearance-${value}`}
            onClick={() => setTheme(value)}
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
