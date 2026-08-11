"use client"

import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useCallback, useRef, useState } from "react"

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
 *
 * ── The account drill-in ────────────────────────────────────────────────────────────────────────
 *
 * The avatar at the foot of the drawer used to render the desktop `AccountMenu` — a `<details>`
 * dropdown positioned `absolute`. Inside a drawer that scrolls and clips, IT OPENED WHERE NOBODY
 * COULD SEE IT: tapping the avatar appeared to do nothing at all, and the account destinations were
 * unreachable on every phone. A dropdown is a desktop affordance; the drawer needed its own.
 *
 * So the drawer is now a STACK OF PANELS rather than one scrolling column — the pattern Apple uses
 * and the one the operator's reference (ius-dev.vercel.app) uses: every level is `absolute inset-0`
 * inside one clipped viewport, and moving between levels slides them across.
 *
 *   root      ◀──  translate-x-0        account   ──▶  translate-x-full   (off-stage, right)
 *   root      ──▶  -translate-x-1/4     account   ◀──  translate-x-0      (drilled in)
 *
 * The outgoing level does not merely disappear: it slides a quarter-width left and fades, which is
 * what makes the motion read as "this is on top of that" instead of "the content was replaced". Both
 * levels stay mounted, so going back is instant and nothing re-renders.
 *
 * ⚠ `inert` on the inactive level is REQUIRED, not polish. Without it the off-stage panel's links
 * stay in the tab order and in the accessibility tree, so a keyboard or screen-reader user tabs
 * straight into controls that are physically off the screen — a drawer that traps focus in a place
 * nobody can see is worse than one with no drill-in at all.
 */

const LINKS = [
  { label: "Home", href: "/" },
  { label: "All products", href: "/search" },
  { label: "On sale", href: "/search?saleOnly=true" },
] as const

/**
 * One panel of the stack.
 *
 * ⚠ `transition` (not `transition-transform`) is deliberate: Tailwind's `transition` covers transform
 * AND opacity, and the outgoing level needs both. `motion-reduce:transition-none` honours FR-025 —
 * motion here is decoration, never information; the panel still arrives, just without travelling.
 */
const panelBase =
  "absolute inset-0 overflow-y-auto transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"

export function MobileNav({
  className,
  accountTrigger,
  accountPanel,
  accountTitle,
}: {
  className?: string
  /**
   * The account control at the foot of the drawer, rendered on the SERVER and passed in.
   *
   * ⚠ This is a slot, not a hardcoded "Sign in" link, because this component is a client component
   * and cannot read the session. A static link would tell an already-signed-in shopper to sign in —
   * on the one surface where the header no longer shows them their account at all.
   */
  accountTrigger?: React.ReactNode
  /**
   * The account destinations, as a second LEVEL of this drawer — also server-rendered.
   *
   * ⚠ `null` is the signal that there is nothing to drill into (a guest), and it comes from the
   * server component that read the session. That is why it is a nullable slot rather than something
   * this component infers: a client component cannot tell a guest from a customer, and guessing
   * wrong means either a dead chevron on a guest's drawer or a signed-in customer with no way to
   * reach their account.
   */
  accountPanel?: React.ReactNode
  /** The name to head the account level with — the customer's, when we have one. */
  accountTitle?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pathname = usePathname()
  const params = useSearchParams()
  const saleOnly = params.get("saleOnly") === "true"

  const [level, setLevel] = useState<"root" | "account">("root")
  const atRoot = level === "root"

  const close = useCallback(() => dialogRef.current?.close(), [])

  // ⚠ Reset on close, not on open. Reopening the drawer must start at the top level — a menu that
  // remembers it was left three levels deep reopens showing something the shopper did not ask for.
  const handleClose = useCallback(() => setLevel("root"), [])

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
        onClose={handleClose}
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

          {/* The stack's viewport: `relative` to position the levels, `overflow-hidden` so the
              off-stage one is clipped rather than widening the drawer. */}
          <div className="relative flex-1 overflow-hidden">
            <div
              inert={!atRoot}
              className={cn(panelBase, atRoot ? "translate-x-0" : "-translate-x-1/4 opacity-0")}
            >
              <nav aria-label="Primary" className="px-3 py-4">
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
            </div>

            {accountPanel && (
              <div
                inert={atRoot}
                // ⚠ An explicit `bg-card`, matching the drawer. The levels overlap during the slide,
                // and a transparent incoming panel would show the outgoing one straight through it.
                className={cn(
                  panelBase,
                  "bg-card",
                  atRoot ? "translate-x-full" : "translate-x-0",
                )}
              >
                <div className="flex items-center gap-1 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setLevel("root")}
                    // The visible chevron is not a label. Without this a screen reader announces
                    // "button" and nothing else, on the only control that leaves this level.
                    aria-label="Back to menu"
                    className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
                  >
                    <ChevronLeft className="size-5" aria-hidden="true" />
                  </button>
                  <span className="truncate text-sm font-semibold">
                    {accountTitle ?? "Your account"}
                  </span>
                </div>

                {/* `onClick` on a wrapper rather than the links themselves: the slot's contents are
                    opaque to this component, so closing has to be handled where the click bubbles to. */}
                <div className="px-3 pb-4" onClick={close}>
                  {accountPanel}
                </div>
              </div>
            )}
          </div>

          {accountTrigger && (
            <div className="border-t px-3 py-3">
              {accountPanel ? (
                <button
                  type="button"
                  onClick={() => setLevel("account")}
                  // The panel is not in the DOM-order sense "expanded" — it is a sibling level. But
                  // `aria-expanded` is still the right contract: this control reveals the thing named
                  // by the panel, and a screen reader user needs to know it did.
                  aria-expanded={!atRoot}
                  data-testid="drawer-account-trigger"
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                >
                  {accountTrigger}
                  <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              ) : (
                // A guest: one tap to sign in, not two. There is no level to drill into.
                <div className="px-2" onClick={close}>
                  {accountTrigger}
                </div>
              )}
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
