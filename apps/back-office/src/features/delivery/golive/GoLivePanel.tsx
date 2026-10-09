import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@effy/web-kit/console";

import { goLiveQuery } from "../queries";
import { LegacyOrders } from "./LegacyOrders";
import { ReadinessTable } from "./ReadinessTable";
import { SwitchControl } from "./SwitchControl";
import { HISTORY_VERB, melbourneMoment } from "./words";

/**
 * Go-live (083): is the platform ready for the new delivery model, when does it start, who set that,
 * and — once it has — how many orders sold the old way are still open.
 */
export function GoLivePanel({ canSwitch, onGoToTab }: { canSwitch: boolean; onGoToTab: (tab: string) => void }) {
  const q = useQuery(goLiveQuery());
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { readiness, switch: sw, legacy, history } = q.data;

  return (
    <div className="space-y-8">
      <ReadinessTable readiness={readiness} onGoToTab={onGoToTab} />
      <SwitchControl sw={sw} ready={readiness.ready} canSwitch={canSwitch} />
      {legacy ? <LegacyOrders legacy={legacy} /> : null}
      {history.length > 0 ? (
        <section className="space-y-2" aria-labelledby="golive-history">
          <h2 id="golive-history" className="text-base font-semibold">History</h2>
          <ul className="max-w-2xl divide-y rounded-md border text-sm" data-testid="golive-history-list">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="space-y-0.5 px-3 py-2">
                <p>
                  <span className="font-medium">{HISTORY_VERB[h.action]}</span>
                  {h.value ? ` to ${melbourneMoment(h.value)}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {h.by}, {melbourneMoment(h.at)}{h.reason ? ` — ${h.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
