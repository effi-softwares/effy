import { useState } from "react"
import { useDebouncedValue } from "@effy/web-kit"

import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import { ChevronRight, Coins, History, Search, SearchX } from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  Button,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, EmptyState } from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"

import { PointsSettingsPanel } from "./components/PointsSettingsPanel"
import { formatPoints } from "./components/points-format"
import { customerSearchQuery } from "./queries"

export function CustomersScreen() {
  const { tab } = useSearch({ strict: false }) as { tab?: string }
  return tab === "settings" ? <PointsSettingsPage /> : <CustomerSearch />
}

const RECENT_KEY = "effy.customers.recent"
interface Recent {
  id: string
  name: string
  email: string
  points: number
}
function readRecent(): Recent[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]")
    return Array.isArray(v) ? (v as Recent[]).slice(0, 5) : []
  } catch {
    return []
  }
}
function remember(r: Recent) {
  try {
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([r, ...readRecent().filter((x) => x.id !== r.id)].slice(0, 5)),
    )
  } catch {}
}

function CustomerSearch() {
  const [q, setQ] = useState("")
  const query = useDebouncedValue(q.trim())
  const search = useQuery(customerSearchQuery(query))
  const recent = readRecent()
  const searching = query.length >= 3

  return (
    <div className="flex max-w-260 flex-col gap-6">
      <PageHeader
        title="Customers"
        description="Find a customer by order number or email to view and adjust their points."
        actions={
          <Button variant="outline" asChild>
            <Link to="/customers" search={{ tab: "settings" }}>
              <Coins aria-hidden="true" />
              Points settings
            </Link>
          </Button>
        }
      />

      <label className="relative flex w-full items-center">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 size-4 text-muted-foreground" />
        <span className="sr-only">Find a customer</span>
        <Input
          type="search"
          placeholder="Order number or customer email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          className="h-12! pl-10! text-base!"
        />
      </label>

      {!searching ? (
        <section className="space-y-3" aria-labelledby="recent-h">
          <p className="text-sm text-muted-foreground">
            Type an order number (EFY-…) or at least three letters of an email.
          </p>
          {recent.length > 0 ? (
            <>
              <h2 id="recent-h" className="text-xs font-medium text-muted-foreground">
                Your recent customers
              </h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/customers/$customerId"
                      params={{ customerId: r.id }}
                      className="flex min-h-14 items-center gap-4 px-5 py-3 text-sm no-underline hover:bg-row-hover max-md:gap-3 max-md:px-4"
                    >
                      <History aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-auto">
                        <span className="font-medium">{r.name || r.email}</span>
                        <span className="block text-muted-foreground">
                          {r.email} · {formatPoints(r.points)} points
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Recent customers are kept in this browser only.</p>
            </>
          ) : null}
        </section>
      ) : search.isError ? (
        <ErrorState error={search.error} onRetry={() => void search.refetch()} />
      ) : search.isPending ? (
        <div className="overflow-hidden rounded-xl border bg-card p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : search.data.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No customer matches that."
          description="Check the order number, or try part of the email address."
        />
      ) : (
        <section className="space-y-3" aria-label="Matches">
          <p className="text-sm text-muted-foreground">
            {search.data.length} {search.data.length === 1 ? "customer matches" : "customers match"} “{query}”
          </p>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="min-w-0">
              <Table className="ef-rtable">
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead numeric>Points</TableHead>
                    <TableHead numeric>Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {search.data.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell data-m="primary">
                        <div className="flex items-center gap-3">
                          <Avatar aria-hidden="true">
                            <AvatarFallback className="bg-primary-muted text-primary">
                              {initialsOf(c.name || c.email)}
                            </AvatarFallback>
                          </Avatar>
                          <Link
                            to="/customers/$customerId"
                            params={{ customerId: c.id }}
                            className="link"
                            onClick={() =>
                              remember({ id: c.id, name: c.name, email: c.email, points: Number(c.points) })
                            }
                          >
                            {c.name || c.email}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell data-m="meta">{c.email}</TableCell>
                      <TableCell numeric data-m="trail">
                        {formatPoints(c.points)}
                      </TableCell>
                      <TableCell numeric data-m="meta" data-label="Orders">
                        {c.orderCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function PointsSettingsPage() {
  return (
    <div className="flex max-w-220 flex-col gap-6">
      <PageHeader
        back={{ label: "Customers", link: { to: "/customers" } }}
        title="Points settings"
        description="How customers earn points, what they are worth, and when they expire."
      />
      <PointsSettingsPanel />
    </div>
  )
}
