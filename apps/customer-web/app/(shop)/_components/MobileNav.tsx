"use client"

import { Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useCallback, useRef } from "react"

import { cn } from "@/lib/utils"

/**
 * The small-screen navigation drawer (025 UI refresh).
 *
 * ── Why a native <dialog> and not a sheet component ─────────────────────────────────────────────
 *
 * `vaul` and `radix-ui` are FORBIDDEN on the guest path (contracts/customer-ui.contract.md §1) and
 * dependency-cruiser fails the build if either becomes reachable from `app/(shop)/`. That is not an
 * obstacle to route around: every public route has a measured byte budget, and a drawer is one of the
 * few things the platform gives away for free.
 *
 * `<dialog>` + `showModal()` provides focus trapping, Escape-to-close, an inert background and top-
 * layer stacking natively. The only thing it does not provide is the slide-in position, which is CSS.
 *
 * ⚠ It is `lg:hidden`, and the desktop `PrimaryNav` is `hidden lg:flex` — the two are mutually
 * exclusive at every width, so the same links are never in the accessibility tree twice. The
 * threshold is `lg` rather than `md` because the header is ONE row: below 1024 px the links and the
 * account control live in here, which is what leaves room for the mark, the cart and the menu.
 */

const LINKS = [
  { label: "Home", href: "/" },
  { label: "Browse", href: "/browse" },
  { label: "All products", href: "/search" },
  { label: "On sale", href: "/search?saleOnly=true" },
] as const

export function MobileNav({
  className,
  account,
}: {
  className?: string
  /**
   * The account control, rendered on the SERVER and passed in.
   *
   * ⚠ This is a slot, not a hardcoded "Sign in" link, because this component is a client component
   * and cannot read the session. A static link would tell an already-signed-in shopper to sign in —
   * on the one surface where the header no longer shows them their account at all.
   *
   * Server components can be passed as props to client components in the App Router, so the real
   * session-aware island lands here untouched.
   */
  account?: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pathname = usePathname()
  const params = useSearchParams()
  const saleOnly = params.get("saleOnly") === "true"

  const close = useCallback(() => dialogRef.current?.close(), [])

  function isActive(href: string): boolean {
    const [path, query] = href.split("?")
    if (pathname !== path) return false
    if (path === "/search") return query ? saleOnly : !saleOnly
    return true
  }

  return (
    <div className={cn("lg:hidden", className)}>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label="Open menu"
        className="inline-flex size-10 items-center justify-center rounded-md hover:bg-accent"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {/* The drawer. `mr-auto` + `h-full` pins it to the left edge and full height; without them a
          <dialog> centres itself, which is the one thing a drawer must not do. */}
      <dialog
        ref={dialogRef}
        aria-label="Menu"
        // Light dismiss. A native <dialog> closes on Escape and NOTHING else — which on a phone,
        // where there is no Escape key, leaves the close button as the only way out. A click whose
        // target is the dialog element itself landed on the backdrop (the panel's children cover the
        // whole box, `p-0`), so this closes on tap-outside without swallowing any interior click.
        // ⚠ Not the `closedby="any"` attribute: still too new to rely on as the only exit.
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
        className="fx-dialog fx-drawer-left mr-auto h-full max-h-none w-[min(20rem,85vw)] max-w-none border-r bg-card p-0 text-foreground backdrop:bg-foreground/40"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <span className="text-lg font-extrabold uppercase tracking-[-0.02em]">Menu</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="flex flex-col gap-1">
              {LINKS.map((link) => {
                const active = isActive(link.href)
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      // Closing on tap matters: Next navigates client-side, so without this the
                      // drawer stays open over the page the shopper just asked for.
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-12 items-center rounded-md px-3 text-base transition-colors",
                        active
                          ? "bg-accent font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {account && (
            // `onClick` on a wrapper rather than the link itself: the slot's contents are opaque to
            // this component, so closing has to be handled where the click bubbles to.
            <div className="flex flex-col gap-2 border-t px-5 py-4" onClick={close}>
              {account}
            </div>
          )}
        </div>
      </dialog>
    </div>
  )
}

/** The shell's copy, rendered while the route-aware drawer streams in. */
export function MobileNavFallback({ className }: { className?: string }) {
  return (
    <div className={cn("lg:hidden", className)}>
      <span
        aria-hidden="true"
        className="inline-flex size-10 items-center justify-center rounded-md"
      >
        <Menu className="size-5" />
      </span>
    </div>
  )
}
