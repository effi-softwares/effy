import { useNavigate } from "@tanstack/react-router"
import { Search } from "lucide-react"

import { Input } from "@effy/design-system/ui"

/**
 * The header's right-hand control: the search field, and nothing else.
 *
 * ⚠ THE PRIMARY ACTION AND THE THEME TOGGLE ARE GONE (design revision 2026-09-10). The action pointed
 * at Restock, which no longer exists, and every screen already carries its own action where the work
 * is (Catalog's "New product", the order's action bar). Appearance stays user-selectable through the
 * sidebar user menu's Light / Dark / Follow-System — the only control that can express "follow the
 * system", and the one the constitution's dark-mode requirement rests on.
 */
export function HeaderChrome() {
  const navigate = useNavigate()

  return (
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
          if (q) void navigate({ to: "/orders", search: { q } })
        }}
      />
    </div>
  )
}
