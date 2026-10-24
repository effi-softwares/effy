import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { ChevronRight, Coins, History, Search, SearchX } from "lucide-react";

import { Button, Input, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@effy/web-kit/patterns";
import { EmptyState } from "@effy/web-kit/patterns";
import { initialsOf } from "@/components/shell/identity";

import { PointsSettingsPanel } from "./components/PointsSettingsPanel";
import { formatPoints } from "./components/points-format";
import { customerSearchQuery } from "./queries";

/**
 * Customers: find one by order number or email to see and change their points. Search-first, with no
 * list of every customer (a privacy surface this console does not need). `?tab=settings` is Points
 * settings.
 */
export function CustomersScreen() {
  const { tab } = useSearch({ strict: false }) as { tab?: string };
  return tab === "settings" ? <PointsSettingsPage /> : <CustomerSearch />;
}

/** Recent customers opened from this page — a per-browser convenience, never sent anywhere. */
const RECENT_KEY = "effy.customers.recent";
interface Recent {
  id: string;
  name: string;
  email: string;
  points: number;
}
function readRecent(): Recent[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? (v as Recent[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}
function remember(r: Recent) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...readRecent().filter((x) => x.id !== r.id)].slice(0, 5)));
  } catch {
    /* storage blocked — search works without it */
  }
}

function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function CustomerSearch() {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const search = useQuery(customerSearchQuery(query));
  const recent = readRecent();
  const searching = query.length >= 3;

  return (
    <div className="flex max-w-[1040px] flex-col gap-6">
      <PageHeader
        title="Customers"
        description="Find a customer to see and change their points. Search by order number or email — there is deliberately no list of everyone."
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
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" />
        <span className="sr-only">Find a customer</span>
        <Input
          type="search"
          placeholder="Order number or customer email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          className="h-12! pl-10! text-[15px]!"
        />
      </label>

      {!searching ? (
        <section className="space-y-3" aria-labelledby="recent-h">
          <p className="text-sm text-muted-foreground">Type an order number (EFY-…) or at least three letters of an email.</p>
          {recent.length > 0 ? (
            <>
              <h2 id="recent-h" className="bo-eyebrow">
                Your recent customers
              </h2>
              <ul className="bo-panel divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link to="/customers/$customerId" params={{ customerId: r.id }} className="bo-attn">
                      <History aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                      <span className="bo-attn__text">
                        <span className="bo-attn__title">{r.name || r.email}</span>
                        <span className="bo-attn__desc block">
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
        <div className="bo-table-wrap p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : search.data.length === 0 ? (
        <EmptyState icon={SearchX} title="No customer matches that." description="Check the order number, or try part of the email address." />
      ) : (
        <section className="space-y-3" aria-label="Matches">
          <p className="text-sm text-muted-foreground">
            {search.data.length} {search.data.length === 1 ? "customer matches" : "customers match"} “{query}”
          </p>
          <div className="bo-table-wrap">
            <div className="bo-table-scroll">
              <table className="bo-table bo-rtable">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Email</th>
                    <th className="is-num">Points</th>
                    <th className="is-num">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {search.data.map((c) => (
                    <tr key={c.id}>
                      <td data-m="primary">
                        <div className="flex items-center gap-3">
                          <span className="bo-avatar bo-avatar--blue" aria-hidden="true">
                            {initialsOf(c.name || c.email)}
                          </span>
                          <Link
                            to="/customers/$customerId"
                            params={{ customerId: c.id }}
                            className="bo-link"
                            onClick={() => remember({ id: c.id, name: c.name, email: c.email, points: Number(c.points) })}
                          >
                            {c.name || c.email}
                          </Link>
                        </div>
                      </td>
                      <td data-m="meta">{c.email}</td>
                      <td data-m="trail" className="is-num">
                        {formatPoints(c.points)}
                      </td>
                      <td data-m="meta" data-label="Orders" className="is-num">
                        {c.orderCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function PointsSettingsPage() {
  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <PageHeader
        back={{ label: "Customers", link: { to: "/customers" } }}
        title="Points settings"
        description="How points are earned, what they are worth, how long they last, and how many support can credit at once."
      />
      <PointsSettingsPanel />
    </div>
  );
}
