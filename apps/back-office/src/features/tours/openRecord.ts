import { useCallback } from "react"

import { useNavigate, useRouter } from "@tanstack/react-router"
import { toast } from "@effy/design-system/ui"

/**
 * For a tour that runs on one record (107 R6): open that record's list, in its own order, and follow its first record -
 * a link to one, or the list's first row. With none, say so and start nothing.
 */

interface Kind {
  to: string
  search?: Record<string, string>
  /** A record's address, to recognise its link on the list. */
  href: RegExp
  noun: string
}

const KINDS: Record<string, Kind> = {
  order: { to: "/orders", href: /^\/orders\/(?!assignments|handover)[^/]+$/, noun: "order" },
  round: { to: "/orders/assignments", href: /^\/orders\/assignments\/rounds\/[^/]+$/, noun: "round" },
  customer: { to: "/customers", search: { tab: "customers" }, href: /^\/customers\/[^/]+$/, noun: "customer" },
  feedback: { to: "/feedback", href: /^\/feedback\/[^/]+$/, noun: "feedback" },
  driver: { to: "/drivers", href: /^\/drivers\/[^/]+$/, noun: "driver" },
  vehicle: { to: "/vehicles", href: /^\/vehicles\/[^/]+$/, noun: "vehicle" },
  shop: { to: "/shops", href: /^\/shops\/[^/]+$/, noun: "shop" },
  product: { to: "/products", href: /^\/products\/(?!new$|imports)[^/]+$/, noun: "product" },
  finish: { to: "/products", href: /^\/products\/[^/]+\/finish$/, noun: "product Effy is setting up" },
  import: { to: "/products/imports", href: /^\/products\/imports\/[^/]+$/, noun: "import" },
  review: { to: "/product-review", href: /^\/product-review\/(?!missing-details)[^/]+$/, noun: "product to review" },
  promotion: { to: "/promotions", href: /^\/promotions\/(?!new$|groups|skins|order-rules)[^/]+$/, noun: "promotion" },
  group: { to: "/promotions/groups", href: /^\/promotions\/groups\/[^/]+$/, noun: "display group" },
  skin: { to: "/promotions/skins", href: /^\/promotions\/skins\/(?!new$)[^/]+$/, noun: "skin" },
  address: { to: "/deliverability", href: /^\/deliverability\/[^/]+$/, noun: "email address" },
  message: { to: "/messages", href: /^\/messages\/(?!new$|automatic$)[^/]+$/, noun: "message" },
  automation: { to: "/messages/automatic", href: /^\/messages\/automatic\/(?!new$)[^/]+$/, noun: "automatic message" },
  "team-member": { to: "/settings/team", href: /^\/settings\/team\/[^/]+$/, noun: "team member" },
}

const WAIT_MS = 6000

/** The list's first record: a link to one, else its first row (which opens on click). */
function firstRecord(kind: Kind): { href: string } | { row: HTMLElement } | null {
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("main a[href]"))) {
    const url = new URL(a.href, window.location.origin)
    if (kind.href.test(url.pathname)) return { href: url.pathname + url.search }
  }
  const row = document.querySelector<HTMLElement>('main [data-tour="list.first-row"]')
  return row ? { row } : null
}

export function useOpenRecord() {
  const navigate = useNavigate()
  const router = useRouter()

  return useCallback(
    async (name: string): Promise<boolean> => {
      const kind = KINDS[name]
      if (!kind) return false
      await navigate({ to: kind.to as never, search: (kind.search ?? {}) as never })
      const found = await new Promise<ReturnType<typeof firstRecord>>((done) => {
        const started = Date.now()
        const look = () => {
          // Wait for the list to have loaded (no skeleton rows), then take its first record.
          const loading = document.querySelector("main [aria-busy='true']")
          const hit = loading ? null : firstRecord(kind)
          if (hit || Date.now() - started > WAIT_MS) done(hit)
          else window.setTimeout(look, 150)
        }
        look()
      })
      if (!found) {
        toast(`There's no ${kind.noun} to show this tour on yet.`)
        return false
      }
      if ("href" in found) await router.history.push(found.href)
      else found.row.click()
      return true
    },
    [navigate, router],
  )
}
