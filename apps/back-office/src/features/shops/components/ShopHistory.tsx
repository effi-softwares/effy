import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@effy/web-kit/console";

import { Panel } from "@effy/web-kit/patterns";
import { Pager } from "@effy/web-kit/patterns";
import { moment } from "@/lib/format";

import { shopHistoryQuery } from "../queries";

const PAGE_SIZE = 10;

/** "shop.user.role_changed" → "User role changed" — the audit action as a sentence. */
function actionWords(action: string): string {
  const words = action.replace(/^shop\./, "").replace(/[._]/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : action;
}

// Viewable shop/user history (FR-016 / SC-010; redesign, board "Shop — activity"), backed by the audit
// log. Server-paged; newest first, Melbourne time.
export function ShopHistory({ shopId }: { shopId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, isPending, isError, refetch } = useQuery(shopHistoryQuery(shopId, page, PAGE_SIZE));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Panel title="Activity" description="Every change to this shop and its roster, Melbourne time." flush>
      {isError ? (
        <div className="p-5">
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
      ) : isPending ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {data.items.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{actionWords(entry.action)}</div>
                    <div className="bo-sub">
                      {entry.targetType}
                      {entry.targetId ? ` · ${entry.targetId}` : ""} · by <span className="font-mono">{entry.actorSub}</span>
                    </div>
                  </div>
                  <span className="bo-sub whitespace-nowrap">{moment(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <Pager
            summary={`${data.total} entr${data.total === 1 ? "y" : "ies"} · page ${data.page} of ${totalPages}`}
            canBack={page > 1}
            canNext={page < totalPages}
            onBack={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </>
      )}
    </Panel>
  );
}
