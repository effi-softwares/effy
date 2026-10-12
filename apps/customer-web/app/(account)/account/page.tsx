import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { CircleHelp, CreditCard, Heart, Lock, MapPin, Pencil, ShieldCheck, Tag } from "lucide-react"
import {
  DELIVERY_TYPE_WORDS,
  type AddressDTO,
  type OrderSummaryDTO,
  type PaymentMethodDTO,
  type PointsBalanceDTO,
  type SavedItemDTO,
} from "@effy/shared-types"

import { CoverageNote } from "@/app/(account)/addresses/_components/CoverageNote"
import { btnClass } from "@/components/storefront/actions"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Breadcrumb, Skeleton } from "@/components/ui/misc"
import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"
import { formatMoney } from "@/lib/money"

import { parseTab, tabHref } from "./tabs"

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
}

/**
 * Account · Overview (reference: Account · Overview; FR-028, FR-029).
 *
 * New in 084. Until then `/account` opened Personal info and the sections were tabs chosen by
 * `?tab=`. ⚠ An old `?tab=` link still arrives: it is redirected to that section's page (FR-014).
 */
export default function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <>
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Overview" }]} className="mb-6" />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  )
}

const DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" })
const SHORT = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" })

function day(iso: string | null | undefined, fmt: Intl.DateTimeFormat): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : fmt.format(d)
}

/**
 * ⚠ EVERY TILE FAILS ALONE. Five independent reads feed five parts of the page; one that errors
 * leaves its own tile saying nothing and touches no other. And a tile with nothing true to say shows
 * its empty wording — never a placeholder number.
 */
async function Overview({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = parseTab((await searchParams).tab)
  if (tab) redirect(tabHref(tab))

  const customer = await requireCustomer("/account")
  const session = await getSession()
  const api = session ? edgeApi(session) : null

  const [orders, points, saved, addresses, cards] = await Promise.all([
    api?.get<OrderSummaryDTO[]>("/commerce/v1/orders", perCustomer).catch(() => null) ?? null,
    api?.get<PointsBalanceDTO>("/customer/v1/points", perCustomer).catch(() => null) ?? null,
    api?.get<SavedItemDTO[]>("/commerce/v1/saved", perCustomer).catch(() => null) ?? null,
    api?.get<AddressDTO[]>("/customer/v1/addresses", perCustomer).catch(() => null) ?? null,
    api
      ?.get<{ paymentMethods: PaymentMethodDTO[] }>("/commerce/v1/payment-methods", perCustomer)
      .then((r) => r.paymentMethods ?? [])
      .catch(() => null) ?? null,
  ])

  const address = addresses?.find((a) => a.isDefault) ?? addresses?.[0] ?? null
  const card = cards?.find((c) => c.isDefault) ?? cards?.[0] ?? null
  const recent = (orders ?? []).slice(0, 3)
  const savedCount = Array.isArray(saved) ? saved.length : null
  const drops = Array.isArray(saved) ? saved.filter((s) => s.priceDropped).length : 0
  const since = day(customer.createdAt, DATE)
  const balance = points ? Number(points.points) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Hi {customer.givenName ?? "there"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.email}
            {since ? ` · Member since ${since}` : ""}
          </p>
        </div>
        <Link href="/account/personal" className={btnClass("outline", "md")}>
          <Pencil aria-hidden="true" />
          Edit profile
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-2 p-6 lg:col-span-2">
          {recent[0] ? (
            <>
              <p className="text-xs text-muted-foreground">Latest order · {recent[0].orderNumber}</p>
              <p className="text-xl font-semibold">
                {recent[0].itemCount} {recent[0].itemCount === 1 ? "item" : "items"} ·{" "}
                {formatMoney(recent[0].grandTotalAmount, recent[0].currency)}
              </p>
              {recent[0].delivery && (
                <CoverageNote coverage={recent[0].delivery.type} />
              )}
              <Link href={`/orders/${recent[0].id}`} className={btnClass("primary", "md", "mt-3 self-start")}>
                Track
              </Link>
            </>
          ) : (
            <>
              <p className="text-xl font-semibold">No orders yet</p>
              <p className="text-sm text-muted-foreground">When you place one, you can follow it from here.</p>
              <Link href="/" className={btnClass("primary", "md", "mt-3 self-start")}>
                Start shopping
              </Link>
            </>
          )}
        </Card>

        <Card className="gap-1 p-6">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Effy points</p>
          {balance !== null && points ? (
            <>
              <p className="text-4xl font-bold tracking-tight tabular-nums">{balance.toLocaleString("en-AU")}</p>
              <p className="text-sm text-muted-foreground">
                worth {formatMoney(points.valueAmount, "AUD")}
                {points.nextExpiry
                  ? ` · ${Number(points.nextExpiry.points).toLocaleString("en-AU")} can be used until ${day(points.nextExpiry.date, SHORT) ?? points.nextExpiry.date}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">We couldn&rsquo;t load your points just now.</p>
          )}
          <p className="mt-auto pt-3 text-xs text-muted-foreground">
            Points are credit from Effy. They have no cash value.{" "}
            <Link href="/account/points" className="text-primary underline underline-offset-4">
              History
            </Link>
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Tile href="/saved" Icon={Heart} title="Saved items">
          {savedCount === null ? (
            "We couldn't load these just now."
          ) : savedCount === 0 ? (
            "Nothing saved yet."
          ) : (
            <>
              {savedCount} saved
              {drops > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-brand">
                    {drops} price {drops === 1 ? "drop" : "drops"}
                  </span>
                </>
              )}
            </>
          )}
        </Tile>
        <Tile href="/addresses" Icon={MapPin} title="Default address">
          {address ? (
            <>
              {address.label ?? address.recipientName} · {address.line1}, {address.city} {address.postalCode}
              <CoverageNote coverage={address.coverage} className="mt-1" />
            </>
          ) : (
            "No address yet. Add one to see who delivers to you."
          )}
        </Tile>
        <Tile href="/account/payment" Icon={CreditCard} title="Default card">
          {card ? (
            <span className="inline-flex items-center gap-2">
              <Badge variant="outline" className="uppercase">
                {card.brand}
              </Badge>
              •••• {card.last4} · Expires {String(card.expMonth).padStart(2, "0")} / {String(card.expYear).slice(-2)}
            </span>
          ) : (
            "No saved card. Cards are added when you pay."
          )}
        </Tile>
      </div>

      <Card padded={false} className="p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold">Recent orders</h2>
          <Link href="/orders" className="text-sm font-medium text-primary underline underline-offset-4">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {orders === null ? "We couldn't load your orders just now." : "You haven't placed any orders yet."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">Order</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Placed</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Total</th>
                  <th scope="col" className="py-2"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 pr-4">
                      <span className="font-medium">{o.orderNumber}</span>
                      <span className="block text-xs text-muted-foreground">
                        {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                        {o.delivery ? ` · ${DELIVERY_TYPE_WORDS[o.delivery.type]}` : ""}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{day(o.placedAt, SHORT) ?? "—"}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatMoney(o.grandTotalAmount, o.currency)}</td>
                    <td className="py-3 text-right">
                      <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                        View<span className="sr-only"> order {o.orderNumber}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section aria-labelledby="quick-links">
        <h2 id="quick-links" className="mb-3 text-sm font-semibold">
          Quick links
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { href: "/account/security", label: "Change password", Icon: Lock },
            { href: "/help", label: "Get help", Icon: CircleHelp },
            { href: "/offers", label: "Offers", Icon: Tag },
            { href: "/account/privacy", label: "Privacy & data", Icon: ShieldCheck },
          ].map(({ href, label, Icon }) => (
            <li key={href}>
              <Link href={href} className={btnClass("outline", "lg", "w-full")}>
                <Icon aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Tile({
  href,
  Icon,
  title,
  children,
}: {
  href: string
  Icon: typeof Heart
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="relative gap-2 p-6">
      <Icon aria-hidden="true" className="size-5" />
      <h2 className="font-semibold">
        <Link href={href} className="after:absolute after:inset-0">
          {title}
        </Link>
      </h2>
      <div className="text-sm text-muted-foreground">{children}</div>
    </Card>
  )
}
