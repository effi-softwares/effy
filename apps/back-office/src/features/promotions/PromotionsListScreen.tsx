import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LayoutList, Palette, Plus, SlidersHorizontal, TicketPercent } from "lucide-react";

import { PROMOTION_STATES, type PromotionKind, type PromotionState, type PromotionTrigger } from "@effy/shared-types";
import { cn } from "@effy/design-system";
import { Button, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { EmptyState } from "@/components/patterns/States";
import { StatusWord } from "@/components/patterns/StatusWord";
import { Facet, Pager, ResetFilters, SearchBox, Toolbar } from "@/components/patterns/Toolbar";
import { sessionQuery } from "@/features/auth/queries";
import { promotionGroupsQuery } from "@/features/promotion-groups/queries";

import { canManagePromotions } from "./access";
import { KIND_WORD, STATE_TONE, STATE_WORD, usesLabel } from "./model";
import { promotionListQuery } from "./queries";

const PAGE_SIZE = 25;
type View = "all" | PromotionState;

const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" });

/** "1 Oct – 31 Oct 2026" / "From 12 Sep 2026" / "Always". */
export function activeDates(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return "Always";
  if (!endsAt) return `From ${dateFmt.format(new Date(startsAt!))}`;
  if (!startsAt) return `Until ${dateFmt.format(new Date(endsAt))}`;
  return `${dateFmt.format(new Date(startsAt))} – ${dateFmt.format(new Date(endsAt))}`;
}

export function PromotionStateWord({ state }: { state: PromotionState }) {
  return <StatusWord tone={STATE_TONE[state]}>{STATE_WORD[state]}</StatusWord>;
}

/**
 * Promotions (094; redesign, board "Promotion codes"): every offer, automatic or by code, in one
 * table — what it gives, who it is for, when, how much it has been used, and where it is shown. State
 * is worked out by the server from the switch, dates, uses and budget; it is never stored.
 */
export function PromotionsListScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManagePromotions(roles);

  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PromotionKind | null>(null);
  const [trigger, setTrigger] = useState<PromotionTrigger | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const groups = useQuery(promotionGroupsQuery());

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      q: search.trim() || undefined,
      state: view === "all" ? undefined : view,
      kind: kind ?? undefined,
      trigger: trigger ?? undefined,
      groupId: groupId ?? undefined,
    }),
    [page, view, search, kind, trigger, groupId],
  );
  const { data, error, isPending, isError, refetch } = useQuery(promotionListQuery(params));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Boolean(search || kind || trigger || groupId);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const countOf = (v: View) =>
    data ? (v === "all" ? Object.entries(data.counts).filter(([s]) => s !== "archived").reduce((a, [, n]) => a + n, 0) : data.counts[v]) : undefined;
  // Archived ones are kept out of "All" (and of the tabs) unless asked for.
  const views: View[] = ["all", ...PROMOTION_STATES];

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Every offer Effy runs — automatic or by code — who it is for, when it runs, and where shoppers see it."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/promotions/groups">
                <LayoutList aria-hidden="true" />
                Display groups
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/promotions/skins">
                <Palette aria-hidden="true" />
                Skins
              </Link>
            </Button>
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
                  Create promotion
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="space-y-3">
        <nav className="bo-tabs" aria-label="Promotion views">
          {views.map((v) => (
            <button
              key={v}
              type="button"
              aria-current={v === view ? "page" : undefined}
              className={cn("bo-tabs__tab", v === view && "is-active")}
              onClick={() => reset(setView)(v)}
            >
              {v === "all" ? "All" : STATE_WORD[v]}
              {countOf(v) !== undefined ? <span className="bo-tabs__count">{countOf(v)}</span> : null}
            </button>
          ))}
        </nav>
        <Toolbar>
          <SearchBox label="Search promotions" placeholder="Name or code…" value={search} onChange={reset(setSearch)} />
          <Facet
            label="Kind"
            value={kind}
            onChange={reset(setKind)}
            options={(Object.keys(KIND_WORD) as PromotionKind[]).map((k) => ({ value: k, label: KIND_WORD[k] }))}
          />
          <Facet
            label="Applies"
            value={trigger}
            onChange={reset(setTrigger)}
            options={[
              { value: "automatic", label: "Automatically" },
              { value: "code", label: "With a code" },
            ]}
          />
          <Facet
            label="Group"
            anyLabel="Any group"
            value={groupId}
            onChange={reset(setGroupId)}
            options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
          />
          {filtered ? (
            <ResetFilters
              onReset={() => {
                setSearch("");
                setKind(null);
                setTrigger(null);
                setGroupId(null);
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
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title={filtered || view !== "all" ? "No promotions match your filter." : "No promotions yet."}
          description={filtered || view !== "all" ? undefined : "Create a promotion to give shoppers money off — automatically or with a code."}
        />
      ) : (
        <div className="bo-table-wrap">
          <div className="bo-table-scroll">
            <table className="bo-table bo-rtable">
              <thead>
                <tr>
                  <th>Promotion</th>
                  <th>Gives</th>
                  <th>Who</th>
                  <th>Status</th>
                  <th>Active dates</th>
                  <th className="text-right">Used</th>
                  <th>Shown in</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td data-m="primary">
                      <Link to="/promotions/$promoId" params={{ promoId: p.id }} className="bo-link">
                        {p.name}
                      </Link>
                      <div className="bo-sub">{p.codeSummary ? <span className="bo-code">{p.codeSummary}</span> : "Automatic"}</div>
                    </td>
                    <td data-m="meta">{p.gives}</td>
                    <td data-m="meta" className="is-muted">
                      {p.who}
                    </td>
                    <td data-m="badge">
                      <PromotionStateWord state={p.state} />
                    </td>
                    <td data-m="meta" className="is-muted">
                      {activeDates(p.startsAt, p.endsAt)}
                    </td>
                    <td data-m="trail" className="text-right tabular-nums">
                      {usesLabel(p)}
                    </td>
                    <td data-m="meta" data-label="Shown in" className="is-muted">
                      {p.groups.length ? p.groups.join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            summary={`${data.total} promotion${data.total === 1 ? "" : "s"} · page ${data.page} of ${totalPages}`}
            canBack={page > 1}
            canNext={page < totalPages}
            onBack={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}
      <p className="bo-sub">
        Status is worked out from a promotion's dates, uses, budget and whether it is paused — it is never stored. Customer service can read
        every promotion; changing one needs a manager or an administrator.
      </p>
    </>
  );
}
