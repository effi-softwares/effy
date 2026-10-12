import Link from "next/link"
import { Coins, Heart, RotateCcw } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { OrderSummaryDTO, PointsBalanceDTO, SavedItemDTO } from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { formatMoney } from "@/lib/money"
import { readServerSession } from "@/lib/session"

/**
 * The signed-in shortcuts under the home banner (reference: Home — signed in; FR-020).
 *
 * ⚠ EACH SHORTCUT IS SHOWN ONLY WHEN IT HAS SOMETHING TRUE TO SAY. No points → no points tile; no
 * saved item that dropped in price → no saved tile; no past order → no "buy again". A customer with
 * none of them gets no row at all, never a row of zeroes.
 *
 * ⚠ Every read fails ALONE. Three independent reads feed three tiles; one that errors removes its own
 * tile and nothing else. A guest renders nothing and costs no request.
 *
 * Points are said as what they are worth, never as a discount (they are a way of paying).
 */
export async function HomeShortcuts() {
  const session = await readServerSession()
  if (!session) return null

  const api = edgeApi(session)
  const [points, saved, orders] = await Promise.all([
    api.get<PointsBalanceDTO>("/customer/v1/points", perCustomer).catch(() => null),
    api.get<SavedItemDTO[]>("/commerce/v1/saved", perCustomer).catch(() => null),
    api.get<OrderSummaryDTO[]>("/commerce/v1/orders", perCustomer).catch(() => null),
  ])

  const tiles: { key: string; href: string; Icon: LucideIcon; label: string; body: React.ReactNode }[] = []

  const balance = points ? Number(points.points) : 0
  if (points && balance > 0) {
    tiles.push({
      key: "points",
      href: "/account/points",
      Icon: Coins,
      label: "Effy points",
      body: (
        <>
          <span className="text-primary">{balance.toLocaleString("en-AU")} pts</span> · worth{" "}
          {formatMoney(points.valueAmount, "AUD")}
        </>
      ),
    })
  }

  const drops = Array.isArray(saved) ? saved.filter((s) => s.priceDropped).length : 0
  if (drops > 0) {
    tiles.push({
      key: "saved",
      href: "/saved",
      Icon: Heart,
      label: "Saved items",
      body: `${drops} dropped in price`,
    })
  }

  const last = Array.isArray(orders) ? orders.find((o) => o.status === "paid") : undefined
  if (last && last.itemCount > 0) {
    tiles.push({
      key: "again",
      href: `/orders/${last.id}`,
      Icon: RotateCcw,
      label: "Buy again",
      body: `${last.itemCount} ${last.itemCount === 1 ? "item" : "items"} from your last order`,
    })
  }

  if (tiles.length === 0) return null

  return (
    <section aria-label="Your shortcuts" className="container pt-4">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ key, href, Icon, label, body }) => (
          <li key={key}>
            <Link
              href={href}
              className="flex h-full flex-col gap-1 rounded-lg border bg-card px-4 py-3 shadow-xs hover:bg-accent"
            >
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </span>
              <span className="text-sm font-medium">{body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
