import { useLocation, useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { Moon, Search, Sun } from "lucide-react"

import { Input } from "@effy/design-system/ui"

import { setTheme, uiStore } from "@/lib/ui-store"

/**
 * The imported design's header controls: a search field, a theme toggle, and one primary action.
 *
 * ⚠ THE HEADER'S ACTION CHANGES WITH THE SCREEN, and the mockup's `ctaLabel` is why: an operator on
 * the order queue wants "Restock", one in the catalog wants "New product". A fixed button would be
 * wrong on five screens out of six.
 *
 * ⚠ THE THEME TOGGLE IS A TWO-WAY SWITCH HERE, NOT THE THREE-WAY MENU. Light / Dark / Follow-System
 * still lives in the sidebar's user menu, which is the only place that can express "follow the system"
 * — a single button has nowhere to put a third state. This is a shortcut to the two an operator flips
 * between during a shift, and it writes the same store, so the two controls cannot disagree.
 */
export function HeaderChrome() {
  const theme = useStore(uiStore, (s) => s.theme)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // ⚠ Resolved from the ACTUAL system preference when the mode is "system", so the icon shows what
  // pressing it will do. Reading `theme === "dark"` would draw a sun on a dark screen.
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches)

  const cta = ctaFor(pathname)

  return (
    <>
      <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-60">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
        />
        <Input
          aria-label="Search orders and products"
          placeholder="Search orders, SKUs…"
          className="h-8 pl-8 text-[13px]"
          onKeyDown={(e) => {
            // ⚠ Enter routes to the screen that can actually answer the query. The header field is a
            // shortcut into the queue's own filter, not a second search implementation — two searches
            // over one dataset is the shape 052 deleted `summarizeFulfillment` for.
            if (e.key !== "Enter") return
            const q = (e.target as HTMLInputElement).value.trim()
            if (q) void navigate({ to: "/orders" })
          }}
        />
      </div>

      <button
        type="button"
        title={isDark ? "Switch to light" : "Switch to dark"}
        aria-label={isDark ? "Switch to light appearance" : "Switch to dark appearance"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="border-input bg-background hover:bg-accent focus-visible:ring-ring grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border focus-visible:ring-2 focus-visible:outline-none"
      >
        {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      </button>

      <button
        type="button"
        onClick={() => void navigate({ to: cta.to })}
        className="bg-primary text-primary-foreground focus-visible:ring-ring h-8 shrink-0 cursor-pointer rounded-md px-3 text-[13px] font-medium whitespace-nowrap hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
      >
        {cta.label}
      </button>
    </>
  )
}

/** ⚠ Derived from the route, so a new screen gets a sensible action without touching the header. */
function ctaFor(pathname: string): { label: string; to: string } {
  if (pathname.startsWith("/catalog")) return { label: "New product", to: "/catalog" }
  if (pathname.startsWith("/restock")) return { label: "New order", to: "/restock" }
  return { label: "Restock", to: "/restock" }
}
