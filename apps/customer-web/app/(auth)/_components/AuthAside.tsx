"use client"

import { usePathname } from "next/navigation"

/**
 * The art panel beside every sign-in, join and reset step (reference: Shared components · Auth card
 * template). Desktop only — below `lg` the form has the whole screen.
 *
 * ⚠ The shapes are an ASSET, not tokens: the two brand hues come from the theme (`--brand`,
 * `--primary`) and the one grey-green is the drawing's own.
 */
const COPY = {
  signIn: "Sign in to track an order, keep your saved items, and check out faster next time.",
  join: "Create an account to order groceries for delivery, save your favourites and check out faster.",
} as const

const LEAF = "M0 0 C30 -6 58 14 66 44 C34 44 8 28 0 0 Z"
const SAGE = "#5f7a66"

export function AuthAside() {
  const pathname = usePathname()
  const copy = pathname?.startsWith("/sign-up") ? COPY.join : COPY.signIn

  return (
    <aside
      aria-label="Effy"
      className="relative hidden flex-1 basis-1/2 overflow-hidden bg-brand-muted lg:block"
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <g fill="none" stroke="var(--brand)">
          <path d="M0.0 230.0 A150 150 0 0 1 176.0 82.3" strokeWidth="36" opacity="0.55" />
          <path d="M502.1 145.7 A140 140 0 0 1 627.8 30.5" strokeWidth="36" opacity="0.55" />
          <path d="M639.0 588.7 A150 150 0 0 1 780.0 490.0" strokeWidth="38" opacity="0.35" />
          <path d="M12.1 868.4 A140 140 0 0 1 107.9 868.4" strokeWidth="30" opacity="0.4" />
        </g>
        <g fill="var(--primary)">
          <circle cx="400" cy="80" r="32" opacity="0.85" />
          <circle cx="240" cy="170" r="9" opacity="0.45" />
          <circle cx="760" cy="95" r="9" opacity="0.8" />
          <circle cx="940" cy="480" r="32" opacity="0.9" />
          <circle cx="800" cy="570" r="9" opacity="0.6" />
        </g>
        <g fill="var(--brand)">
          <rect x="330" y="240" width="135" height="34" rx="17" opacity="0.2" transform="rotate(12 397.5 257)" />
          <rect x="800" y="200" width="135" height="34" rx="17" opacity="0.35" transform="rotate(12 867.5 217)" />
          <rect x="400" y="760" width="135" height="34" rx="17" opacity="0.18" transform="rotate(12 467.5 777)" />
          <rect x="870" y="700" width="135" height="34" rx="17" opacity="0.3" transform="rotate(12 937.5 717)" />
          <rect x="-20" y="820" width="80" height="34" rx="17" opacity="0.3" transform="rotate(12 20.0 837)" />
          <path d={LEAF} opacity="0.55" transform="translate(820 320) rotate(25)" />
          <path d={LEAF} opacity="0.55" transform="translate(910 800) rotate(25)" />
          <path d={LEAF} opacity="0.4" transform="translate(440 860) rotate(25)" />
        </g>
        <g fill="none" stroke={SAGE}>
          <circle cx="660" cy="300" r="44" strokeWidth="9" opacity="0.7" />
          <path d="M148.4 394.0 A48 48 0 0 1 206.4 324.9" strokeWidth="6" opacity="0.35" />
          <circle cx="730" cy="770" r="45" strokeWidth="9" opacity="0.75" />
          <circle cx="260" cy="840" r="45" strokeWidth="9" opacity="0.5" />
        </g>
      </svg>
      <div className="absolute inset-x-[12%] top-1/2 -translate-y-1/2">
        <p className="text-[52px] font-semibold leading-[1.02] tracking-[-0.03em] text-foreground">
          Groceries,
          <br />
          delivered.
        </p>
        <p className="mt-6 max-w-[420px] text-lg leading-[1.55] text-foreground">{copy}</p>
      </div>
    </aside>
  )
}
