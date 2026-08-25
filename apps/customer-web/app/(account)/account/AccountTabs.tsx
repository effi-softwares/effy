"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, useContext, useState, useTransition, type ReactNode } from "react"
import { ChevronRight, CreditCard, FileText, MapPin, Scale, ShieldCheck, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { LoadingArea } from "@/components/Spinner"

import { tabHref, type AccountTab } from "./tabs"

/**
 * TAB SWITCHING, AND ITS LOADING STATE (034 FR-006).
 *
 * ⚠ WHY THIS OWNS THE NAVIGATION INSTEAD OF LEAVING IT TO `<Link>`.
 *
 * The tabs are real URL navigations (`?tab=`), and `/account` is a PPR route whose ENTIRE body —
 * sidebar included — sits inside one `<Suspense>` boundary. Left to the router, switching tabs is a
 * navigation to a new URL, so the prerendered shell can take over and the whole grid, identity card
 * and section nav included, blinks to a full-page skeleton on its way to a page where all of that is
 * about to be identical. The one region that genuinely changed is the only one with no indicator.
 *
 * Driving the navigation inside a transition we own inverts that. React keeps the current tree
 * mounted for the duration — no boundary re-suspends, so no shell swap — and `pending` is ours to
 * render wherever it belongs, which is the content column and nowhere else.
 *
 * ⚠ THE LINKS ARE STILL REAL ANCHORS. `<Link>` keeps its `href`, its prefetch and its element type,
 * so cmd/ctrl/middle-click still open a tab in a new window and assistive technology still reads a
 * list of links. Only the plain left-click is intercepted.
 */

interface TabsContext {
  /** The tab to PRESENT as current — the destination while a switch is in flight. */
  shown: AccountTab
  pending: boolean
  go: (tab: AccountTab) => void
}

const Ctx = createContext<TabsContext | null>(null)

function useTabs(): TabsContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("Account tab components must be rendered inside <AccountTabsProvider>")
  return ctx
}

export function AccountTabsProvider({
  active,
  children,
}: {
  active: AccountTab
  /** Server-rendered content, passed through untouched. */
  children: ReactNode
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [target, setTarget] = useState<AccountTab | null>(null)

  // ⚠ The nav highlights the DESTINATION the moment it is clicked, not when the server answers.
  // Otherwise the one thing that responds instantly — the pressed item — is the one thing that looks
  // like it ignored the press, while the content area spins.
  const shown = pending && target ? target : active

  function go(tab: AccountTab) {
    setTarget(tab)
    start(() => router.push(tabHref(tab)))
  }

  return <Ctx.Provider value={{ shown, pending, go }}>{children}</Ctx.Provider>
}

/**
 * The content column. Renders the active tab, or the busy state while a switch is in flight.
 *
 * ⚠ It REPLACES the outgoing tab rather than dimming it. A half-faded Security panel sitting under a
 * spinner while Privacy loads is a screen showing two answers to "where am I?" — and the stale one
 * is the larger and more legible of the two.
 */
export function TabContent({ children }: { children: ReactNode }) {
  const { pending } = useTabs()

  if (pending) {
    return <LoadingArea label="Loading this section…" testId="tab-loading" />
  }

  return <>{children}</>
}

const ITEMS: { tab: AccountTab; label: string; hint: string; Icon: LucideIcon }[] = [
  { tab: "personal", label: "Personal info", hint: "Name, phone, email", Icon: User },
  { tab: "addresses", label: "Address book", hint: "Where we deliver", Icon: MapPin },
  { tab: "payment", label: "Payment methods", hint: "Cards you've saved", Icon: CreditCard },
  { tab: "security", label: "Security", hint: "Password, sign-out", Icon: ShieldCheck },
  { tab: "privacy", label: "Privacy & data", hint: "Export, delete", Icon: FileText },
  { tab: "legal", label: "Legal", hint: "Policies & terms", Icon: Scale },
]

/**
 * The account's sections (034 FR-006) — the primary navigation for this area.
 *
 * All four are TABS on this page: activating one sets `?tab=` and swaps the content area in place,
 * so managing addresses, security and privacy never leaves the account hub. `aria-current="page"`
 * marks whichever is showing.
 */
export function SectionNav() {
  const { shown, pending, go } = useTabs()

  return (
    <nav aria-label="Account settings" className="mt-4">
      <ul className="space-y-1">
        {ITEMS.map(({ tab, label, hint, Icon }) => {
          const current = shown === tab
          return (
            <li key={tab}>
              <Link
                href={tabHref(tab)}
                aria-current={current ? "page" : undefined}
                // While a switch is in flight the destination is already marked current, so the
                // region it describes is the one that is loading.
                aria-busy={pending && current ? true : undefined}
                onClick={(e) => {
                  // ⚠ Let the browser have the clicks that mean "somewhere else": a new tab, a new
                  // window, a download. Intercepting those is how a link stops behaving like a link.
                  if (
                    e.metaKey ||
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.altKey ||
                    e.button !== 0
                  ) {
                    return
                  }
                  e.preventDefault()
                  if (tab === shown) return
                  go(tab)
                }}
                className={
                  "flex min-h-[56px] items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring " +
                  (current ? "bg-muted font-medium" : "hover:bg-muted/60")
                }
              >
                <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{hint}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
