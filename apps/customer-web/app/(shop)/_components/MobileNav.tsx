"use client"

import { ChevronLeft, ChevronRight, Menu } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"

import { clsx } from "clsx"

import { loadSideDrawer, useLazyOverlay } from "@/components/overlays/lazy"

/**
 * The small-screen navigation drawer: shadcn's Drawer from the left edge (`SideDrawer`), fetched on
 * demand because vaul and radix are barred from the guest first load. `lg:hidden`, the
 * mirror of `PrimaryNav`'s `hidden lg:flex`, so the links are never in the accessibility tree twice.
 *
 * The account drill-in is a stack of panels in one clipped viewport, each `absolute inset-0`:
 *
 *  root ◀── translate-x-0 account ──▶ translate-x-full (off-stage, right)
 *  root ──▶ -translate-x-1/4 account ◀── translate-x-0 (drilled in)
 *
 * Both levels stay mounted, so going back is instant. The inactive level is `inert`, or its links would
 * stay in the tab order while off screen.
 */

const LINKS = [
  { label: "Home", href: "/" },
  { label: "All products", href: "/search" },
  { label: "On sale", href: "/search?saleOnly=true" },
  { label: "Offers", href: "/offers" },
] as const

/** One panel of the stack. `transition` covers transform and opacity (the outgoing level needs both); `motion-reduce:transition-none` drops the travel. */
const panelBase =
  "absolute inset-0 overflow-y-auto transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"

export function MobileNav({
  className,
  accountTrigger,
  accountPanel,
  accountTitle,
  accountRoots,
  aisles,
}: {
  /** The aisle list, rendered on the server and slotted under the fixed links. */
  aisles?: React.ReactNode
  className?: string
  /** The account control at the drawer's foot, rendered on the server and passed in (this client component cannot read the session). */
  accountTrigger?: React.ReactNode
  /**
   * The account destinations, as a second level of this drawer — also server-rendered.
   *
   * `null` is the signal that there is nothing to drill into (a guest), and it comes from the
   * server component that read the session. That is why it is a nullable slot rather than something
   * this component infers: a client component cannot tell a guest from a customer, and guessing
   * wrong means either a dead chevron on a guest's drawer or a signed-in customer with no way to
   * reach their account.
   */
  accountPanel?: React.ReactNode
  /** The name to head the account level with — the customer's, when we have one. */
  accountTitle?: string
  /**
   * The paths of the account area. On a page under one of them the drawer opens on the account level:
   * below `lg` those pages have no sidebar, so this drawer is their section navigation and the menu
   * button has to land on it — not two taps away behind the avatar.
   */
  accountRoots?: readonly string[]
}) {
  const { Overlay: Drawer, open, setOpen, want } = useLazyOverlay(loadSideDrawer)
  const pathname = usePathname()
  const params = useSearchParams()
  const saleOnly = params.get("saleOnly") === "true"

  // The level the drawer opens on is derived from the route, and only a tap inside the drawer
  // overrides it. Stored instead, it would be set from the page the shopper was leaving (a link
  // closes the drawer before the route changes) and reopen on the wrong level on the next page.
  const inAccount =
    !!accountPanel &&
    !!accountRoots?.some((root) => pathname === root || pathname.startsWith(root + "/"))
  const [chosen, setChosen] = useState<"root" | "account" | null>(null)
  const level = chosen ?? (inAccount ? "account" : "root")
  const atRoot = level === "root"

  // Reset on close, not on open. Reopening the drawer must start at the route's own level — a menu
  // that remembers where it was left reopens showing something the shopper did not ask for.
  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) setChosen(null)
    },
    [setOpen],
  )
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  function isActive(href: string): boolean {
    const [path, query] = href.split("?")
    if (pathname !== path) return false
    if (path === "/search") return query ? saleOnly : !saleOnly
    return true
  }

  return (
    <div className={clsx("lg:hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={want}
        onFocus={want}
        aria-label="Open menu"
        className="-ml-2 inline-flex size-10 items-center justify-center rounded-md hover:bg-accent"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {Drawer && (
        <Drawer
          open={open}
          onOpenChange={onOpenChange}
          side="left"
          width="85%"
          maxWidth="22.5rem"
          title="Menu"
          closeLabel="Close menu"
          headerClassName="border-b py-3"
        >
          {/* The stack's viewport: `relative` to position the levels, `overflow-hidden` so the
              off-stage one is clipped rather than widening the drawer. */}
          <div className="relative flex-1 overflow-hidden">
            <div
              inert={!atRoot}
              className={clsx(panelBase, atRoot ? "translate-x-0" : "-translate-x-1/4 opacity-0")}
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
                          className={clsx(
                            "flex h-11 items-center rounded-md px-3 text-sm font-medium transition-colors",
                            active
                              ? "bg-accent text-foreground"
                              : "hover:bg-accent",
                          )}
                        >
                          {link.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                {aisles}
              </nav>
            </div>

            {accountPanel && (
              <div
                inert={atRoot}
                // An explicit `bg-card`, matching the drawer. The levels overlap during the slide,
                // and a transparent incoming panel would show the outgoing one straight through it.
                className={clsx(
                  panelBase,
                  "bg-background",
                  atRoot ? "translate-x-full" : "translate-x-0",
                )}
              >
                <div className="flex items-center gap-1 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setChosen("root")}
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
                  onClick={() => setChosen("account")}
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
        </Drawer>
      )}
    </div>
  )
}

/** The shell's copy, rendered while the route-aware drawer streams in. */
export function MobileNavFallback({ className }: { className?: string }) {
  return (
    <div className={clsx("lg:hidden", className)}>
      <span
        aria-hidden="true"
        className="-ml-2 inline-flex size-10 items-center justify-center rounded-md"
      >
        <Menu className="size-5" />
      </span>
    </div>
  )
}
