import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";

import { cn } from "@effy/design-system";
import { Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@effy/web-kit/patterns";
import { EmptyState } from "@effy/web-kit/patterns";
import { StatusWord } from "@effy/web-kit/patterns";
import { Pager, SearchBox, Toolbar } from "@effy/web-kit/patterns";
import { moment } from "@/lib/format";

import { STATE_LABEL, type EmailDeliveryState } from "./model";
import { deliverabilityListQuery } from "./queries";

/**
 * Addresses the platform cannot reach.
 *
 * Why this screen exists. A send to a blocked address returns success and delivers nothing. Before
 * it, a customer whose address hard-bounced was permanently locked out of an account that — for
 * driver, shop and back-office — has no other credential, and nobody at Effy could find out.
 *
 * No cards, no metric tiles (Principle V). A table and detail rows. A "3 undeliverable" tile at the
 * top would answer a question nobody asks; the list of who is the whole product.
 */
const PAGE_SIZE = 25;
const PROBLEMS = "problems";

const VIEWS: readonly { key: string; label: string }[] = [
  // Defaults to problems only. A list of every address ever delivered to answers no question
  // anyone has, and would bury the handful that matter.
  { key: PROBLEMS, label: "Needs attention" },
  { key: "undeliverable", label: STATE_LABEL.undeliverable },
  { key: "soft_failing", label: STATE_LABEL.soft_failing },
  { key: "complained", label: STATE_LABEL.complained },
  { key: "all", label: "All addresses" },
];

export function DeliverabilityListScreen() {
  const [state, setState] = useState<string>(PROBLEMS);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const params = useMemo(
    () => ({
      state: state === PROBLEMS ? undefined : (state as EmailDeliveryState | "all"),
      q: q.trim() || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [state, q, page],
  );

  const { data, isPending, isError, error, refetch } = useQuery(deliverabilityListQuery(params));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        title="Email deliverability"
        description="Email addresses that are bouncing or rejected, which can stop people receiving sign-in codes."
      />

      <div className="space-y-3">
        <nav className="bo-tabs" aria-label="Deliverability views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-current={v.key === state ? "page" : undefined}
              className={cn("bo-tabs__tab", v.key === state && "is-active")}
              onClick={() => {
                setState(v.key);
                setPage(0);
              }}
            >
              {v.label}
              {v.key === state && data ? <span className="bo-tabs__count">{data.total}</span> : null}
            </button>
          ))}
        </nav>
        <Toolbar>
          <SearchBox
            label="Search address"
            placeholder="Search address…"
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(0);
            }}
          />
        </Toolbar>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="bo-table-wrap p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon={MailCheck} title="No delivery problems." description="Every address the platform has emailed is reachable." />
      ) : (
        <div className="bo-table-wrap">
          <div className="bo-table-scroll">
            <table className="bo-table bo-rtable">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>State</th>
                  <th>Account</th>
                  <th>Reason</th>
                  <th>Last event</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.address}>
                    <td data-m="primary">
                      <Link to="/deliverability/$address" params={{ address: r.address }} className="bo-link">
                        {r.address}
                      </Link>
                    </td>
                    {/* A text label, never colour alone (Principle V). */}
                    <td data-m="badge">
                      <StateLabel state={r.state} />
                    </td>
                    <td data-m="meta">
                      {/* "—" is the honest answer: an address can fail before its account exists,
                          after it is deleted, or for the driver audience, which has no platform table. */}
                      {r.subject ? (
                        <>
                          {r.subject.name ?? <span className="text-muted-foreground">unnamed</span>}{" "}
                          <span className="bo-sub">({r.subject.kind.replace("_", " ")})</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td data-m="meta" className="is-muted">
                      <span className="font-mono text-xs">{r.reason ?? "—"}</span>
                    </td>
                    <td data-m="trail" className="is-muted whitespace-nowrap">
                      {moment(r.lastEventAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            summary={`${data.total} address${data.total === 1 ? "" : "es"} · page ${page + 1} of ${totalPages}`}
            canBack={page > 0}
            canNext={(page + 1) * PAGE_SIZE < data.total}
            onBack={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}
    </>
  );
}

const STATE_TONE = { undeliverable: "problem", soft_failing: "waiting", complained: "waiting", reachable: "quiet" } as const;

export function StateLabel({ state }: { state: EmailDeliveryState }) {
  return <StatusWord tone={STATE_TONE[state as keyof typeof STATE_TONE] ?? "quiet"}>{STATE_LABEL[state]}</StatusWord>;
}
