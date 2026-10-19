import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, SlidersHorizontal, TicketPercent } from "lucide-react";

import type { PromoKind, PromoState } from "@effy/shared-types";
import { cn } from "@effy/design-system";
import { Button, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { EmptyState } from "@/components/patterns/States";
import { StatusWord } from "@/components/patterns/StatusWord";
import { Facet, Pager, ResetFilters, SearchBox, Toolbar } from "@/components/patterns/Toolbar";

import { sessionQuery } from "@/features/auth/queries";

import { canManagePromotions } from "./access";
import { promoValueLabel, redemptionLabel, type PromoCode } from "./model";
import { promoListQuery } from "./queries";

// The promotional-code register (027 US10). A table, not cards — Principle V, and the operator's
// question here is comparative ("which codes are live, which are nearly exhausted"), which is what a
// table answers and a grid of cards does not.

const PAGE_SIZE = 20;

type View = "all" | PromoState;
const VIEWS: readonly { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "scheduled", label: "Scheduled" },
  { key: "used_up", label: "Used up" },
  { key: "ended", label: "Ended" },
  { key: "disabled", label: "Disabled" },
];

/** Active / Scheduled / Used up / Ended / Disabled — the server's word when it sent one (the list);
 *  otherwise the same rule worked out here (a code's own page). Never stored. */
export function promoState(promo: PromoCode & { state?: PromoState }): PromoState {
  if (promo.state) return promo.state;
  if (promo.status !== "active") return "disabled";
  const now = Date.now();
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) return "scheduled";
  if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) return "used_up";
  if (promo.endsAt && new Date(promo.endsAt).getTime() <= now) return "ended";
  return "active";
}

const STATE_WORD = { active: "Active", scheduled: "Scheduled", used_up: "Used up", ended: "Ended", disabled: "Disabled" } as const;
const STATE_TONE = { active: "done", scheduled: "info", used_up: "quiet", ended: "quiet", disabled: "muted" } as const;
const PLACEMENT_WORD: Record<PromoCode["bannerPlacement"], string> = { carousel: "Offers carousel", inline: "Between sections" };

export function PromoStateWord({ promo }: { promo: PromoCode & { state?: PromoState } }) {
  const st = promoState(promo);
  return <StatusWord tone={STATE_TONE[st]}>{STATE_WORD[st]}</StatusWord>;
}

const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" });

export function activeDates(promo: PromoCode): string {
  if (!promo.startsAt && !promo.endsAt) return "Always";
  if (!promo.endsAt) return `From ${dateFmt.format(new Date(promo.startsAt!))}`;
  if (!promo.startsAt) return `Until ${dateFmt.format(new Date(promo.endsAt))}`;
  return `${dateFmt.format(new Date(promo.startsAt))} – ${dateFmt.format(new Date(promo.endsAt))}`;
}

export function PromotionsListScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManagePromotions(roles);

  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PromoKind | null>(null);
  const [onStorefront, setOnStorefront] = useState<"yes" | "no" | null>(null);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      state: view === "all" ? undefined : view,
      kind: kind ?? undefined,
      advertised: onStorefront === null ? undefined : onStorefront === "yes",
      q: search.trim() || undefined,
    }),
    [page, view, kind, onStorefront, search],
  );

  const { data, error, isPending, isError, refetch } = useQuery(promoListQuery(params));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const items = data?.items ?? [];
  const counts = data?.counts;
  const countOf = (v: View) => (counts ? (v === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[v]) : undefined);
  const filtered = Boolean(search || kind || onStorefront);
  function reset<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  return (
    <>
      <PageHeader
        title="Promotion codes"
        description="Promotional codes and the order rules every cart is checked against."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/promotions/order-rules">
                <SlidersHorizontal aria-hidden="true" />
                Order rules
              </Link>
            </Button>
            {canManage ? (
              <Button asChild>
                <Link to="/promotions/new">
                  <Plus aria-hidden="true" />
                  Create code
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="space-y-3">
        <nav className="bo-tabs" aria-label="Code views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-current={v.key === view ? "page" : undefined}
              className={cn("bo-tabs__tab", v.key === view && "is-active")}
              onClick={() => {
                setView(v.key);
                setPage(1);
              }}
            >
              {v.label}
              {countOf(v.key) !== undefined ? <span className="bo-tabs__count">{countOf(v.key)}</span> : null}
            </button>
          ))}
        </nav>
        <Toolbar>
          <SearchBox
            label="Search codes"
            placeholder="Search by code…"
            value={search}
            onChange={reset(setSearch)}
          />
          <Facet
            label="Takes off"
            value={kind}
            onChange={reset(setKind)}
            options={[
              { value: "percentage", label: "A percentage" },
              { value: "fixed", label: "A fixed amount" },
            ]}
          />
          <Facet
            label="On the storefront"
            value={onStorefront}
            onChange={reset(setOnStorefront)}
            options={[
              { value: "yes", label: "Advertised" },
              { value: "no", label: "Not advertised" },
            ]}
          />
          {filtered ? (
            <ResetFilters
              onReset={() => {
                setSearch("");
                setKind(null);
                setOnStorefront(null);
                setPage(1);
              }}
            />
          ) : null}
        </Toolbar>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="bo-table-wrap p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title={search || view !== "all" ? "No codes match your filter." : "No codes yet."}
          description={search || view !== "all" ? undefined : "Create a code to give customers money off at checkout."}
        />
      ) : (
        <div className="bo-table-wrap">
          <div className="bo-table-scroll">
            <table className="bo-table bo-rtable">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Value</th>
                  <th className="text-right">Minimum</th>
                  <th>Status</th>
                  <th>Active dates</th>
                  <th className="text-right">Redeemed</th>
                  <th>Storefront</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td data-m="primary">
                      <Link to="/promotions/$promoId" params={{ promoId: p.id }} className="bo-link bo-code">
                        {p.code}
                      </Link>
                    </td>
                    <td data-m="meta">{promoValueLabel(p)}</td>
                    <td data-m="meta" data-label="Minimum" className="text-right tabular-nums">
                      {Number(p.minimumSubtotalAmount) > 0 ? `$${p.minimumSubtotalAmount}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td data-m="badge">
                      <PromoStateWord promo={p} />
                    </td>
                    <td data-m="meta" className="is-muted">
                      {activeDates(p)}
                    </td>
                    <td data-m="trail" className="text-right tabular-nums">
                      {redemptionLabel(p)}
                    </td>
                    <td data-m="meta" data-label="Storefront" className="is-muted">
                      {p.isAdvertised ? PLACEMENT_WORD[p.bannerPlacement] : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            summary={`${data.total} code${data.total === 1 ? "" : "s"} · page ${data.page} of ${totalPages}`}
            canBack={page > 1}
            canNext={page < totalPages}
            onBack={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      <p className="bo-sub">
        Status is worked out from the code's dates, its caps and whether it is switched on — it is never stored. Customer service can
        read every code; changing one needs a manager or an administrator.
      </p>
    </>
  );
}
