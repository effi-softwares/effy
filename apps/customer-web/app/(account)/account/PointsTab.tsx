import Link from "next/link"

import type { CustomerPointsDTO, PointsHistoryEntryDTO } from "@effy/shared-types"

import { LiveRefresh } from "@/components/live/LiveRefresh"
import { edgeApi, uncached } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

import { PointsViewed } from "./PointsViewed"

const money = (amount: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", currencyDisplay: "narrowSymbol" }).format(Number(amount))
const pts = (n: number) => Math.abs(n).toLocaleString("en-AU")
/** "8 Oct 2027" — a Melbourne date, read at noon so no zone moves it to another day. */
const day = (ymd: string) =>
  new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Melbourne" }).format(new Date(`${ymd}T12:00:00+10:00`))
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Melbourne" }).format(new Date(iso))

/**
 * Effy points (074 US1) — the balance and every change to it.
 *
 * ⚠ SERVER-RENDERED, LIKE EVERY OTHER TAB: the balance is read from the platform, and `LiveRefresh`
 * re-renders the page when the platform says the customer's points changed (071). Nothing here holds
 * a copy of the balance.
 *
 * ⚠ A FAILED READ IS NOT A ZERO BALANCE. "You have no points" said to someone who has some is a false
 * statement about their own account (the payment-methods tab's rule), so a failure says so instead.
 *
 * ⚠ A LIST, NOT CARDS (Principle V). Older lines are reached by `?cursor=`, a real URL, so paging is
 * server-rendered too.
 */
export async function PointsTab({ cursor }: { cursor?: string }) {
  const session = await getSession()
  // One read: the balance and this page of history arrive together (CustomerPointsDTO).
  let balance: CustomerPointsDTO | null = null
  if (session?.idToken) {
    try {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
      balance = await edgeApi(session).get<CustomerPointsDTO>(`/customer/v1/points${qs}`, uncached())
    } catch {
      balance = null
    }
  }
  const page = balance?.history ?? null

  return (
    <section aria-labelledby="points-heading" className="space-y-6">
      <LiveRefresh />
      <PointsViewed />
      <div className="space-y-1">
        <h2 id="points-heading" className="text-xl font-semibold">
          Effy points
        </h2>
        <p className="text-sm text-muted-foreground">
          Points are credit from Effy. Use them on anything at checkout, delivery included. They have no cash value.
        </p>
      </div>

      {balance === null || page === null ? (
        <p role="alert" className="text-sm">
          We couldn&rsquo;t load your points just now. Please try again in a moment.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Balance</dt>
            <dd>
              <span className="text-lg font-semibold tabular-nums">{pts(balance.points)} points</span>{" "}
              <span className="text-muted-foreground">· worth {money(balance.valueAmount)}</span>
            </dd>
            {balance.nextExpiry ? (
              <>
                <dt className="text-muted-foreground">Expiring</dt>
                <dd className="tabular-nums">
                  {pts(balance.nextExpiry.points)} points can be used until {day(balance.nextExpiry.date)}
                </dd>
              </>
            ) : null}
          </dl>

          {page.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {cursor ? "No older activity." : "You don’t have any points yet. If Effy gives you points, they’ll show up here."}
            </p>
          ) : (
            <ul className="divide-y divide-border border-y text-sm" aria-label="Points history">
              {page.entries.map((e) => (
                <HistoryRow key={e.id} entry={e} />
              ))}
            </ul>
          )}

          <nav className="flex gap-4 text-sm" aria-label="Points history pages">
            {cursor ? (
              <Link href="/account?tab=points" className="text-primary hover:underline">
                Newest
              </Link>
            ) : null}
            {page.nextCursor ? (
              <Link href={`/account?tab=points&cursor=${encodeURIComponent(page.nextCursor)}`} className="text-primary hover:underline">
                Older
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </section>
  )
}

function HistoryRow({ entry }: { entry: PointsHistoryEntryDTO }) {
  const credit = entry.points > 0
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">{entry.words}</p>
        <p className="text-muted-foreground">
          {when(entry.at)}
          {credit && entry.expiresOn ? ` · use by ${day(entry.expiresOn)}` : ""}
        </p>
      </div>
      <p className={`shrink-0 tabular-nums font-medium ${credit ? "" : "text-muted-foreground"}`}>
        {credit ? "+" : "−"}
        {pts(entry.points)}
      </p>
    </li>
  )
}
