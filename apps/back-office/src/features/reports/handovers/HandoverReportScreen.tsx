import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  PARCEL_MISSING_REASON_WORDS,
  READ_OUTCOME_WORDS,
  type HandoverMixDTO,
} from "@effy/shared-types";
import { Input, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { DetailRows, Panel } from "@/components/patterns/Panel";

import { handoverReportQuery } from "./queries";

const melbourneDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(d);

const SURFACE_WORDS = { driver_app: "Driver app", shop_web: "Shop console", back_office: "Back-office" } as const;
const ACTOR_WORDS = { driver: "Drivers", shop_staff: "Shop staff", admin_staff: "Hub staff" } as const;

const total = (m: HandoverMixDTO) => m.scan + m.typed + m.manual;
const pct = (n: number, of: number) => (of === 0 ? "—" : `${Math.round((n / of) * 100)}%`);

/**
 * 096 US6 — how bags were handed over, and what went wrong (FR-063). Shops and drivers whose bags are
 * most often NOT scanned come first: they are the labels, printers and habits to fix.
 *
 * ⚠ TABLES AND DETAIL ROWS, NO METRIC CARDS (Principle V) — the per-1,000 figure is a row, not a tile.
 */
export function HandoverReportScreen() {
  const today = melbourneDay(new Date());
  const [from, setFrom] = useState(melbourneDay(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(today);
  const { data, error, isError, isPending, refetch } = useQuery(handoverReportQuery(from, to));

  return (
    <>
      <PageHeader
        title="Hand-over report"
        description="How bags changed hands — scanned, typed or by hand — and what went wrong."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">From</span>
              <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-40" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">To</span>
              <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-40" />
            </label>
          </div>
        }
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-6">
          <Panel title="Summary">
            <DetailRows
              rows={[
                { label: "Hand-overs", value: total(data.overall) },
                {
                  label: "Scanned",
                  value: `${data.overall.scan} (${pct(data.overall.scan, total(data.overall))}) · typed ${data.overall.typed} · by hand ${data.overall.manual}`,
                },
                { label: "Exceptions per 1,000 hand-overs", value: data.exceptionsPer1000 === null ? "—" : data.exceptionsPer1000 },
                { label: "Exceptions", value: `${data.exceptions} — refused reads (not repeats) and bags declared missing` },
                { label: "Phone and server disagreed", value: data.disagreements },
              ]}
            />
          </Panel>

          <Panel title="By who handed over" flush>
            <MixTable rows={data.byActor.map((r) => ({ key: r.actor, name: ACTOR_WORDS[r.actor], ...r }))} label="By who handed over" first="Who" />
          </Panel>

          <Panel title="By shop" description="Least scanned first — a shop low here is usually printing labels badly." flush>
            <MixTable rows={data.byShop.map((r) => ({ key: r.shopId, name: r.shopName, ...r }))} label="By shop" first="Shop" />
          </Panel>

          <Panel title="By driver" description="Least scanned first." flush>
            <MixTable rows={data.byDriver.map((r) => ({ key: r.driverId, name: r.driverName, ...r }))} label="By driver" first="Driver" />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Refused reads" flush>
              {data.refused.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No read was refused in this period.</p>
              ) : (
                <table className="bo-table bo-table--compact bo-table--plain" aria-label="Refused reads">
                  <thead>
                    <tr>
                      <th>Outcome</th>
                      <th>Where</th>
                      <th className="text-right">Reads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.refused.map((r) => (
                      <tr key={`${r.outcome}:${r.surface}`}>
                        <td>{READ_OUTCOME_WORDS[r.outcome]}</td>
                        <td>{SURFACE_WORDS[r.surface]}</td>
                        <td className="text-right tabular-nums">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
            <Panel title="Bags declared missing" flush>
              {data.missing.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No bag was declared missing in this period.</p>
              ) : (
                <table className="bo-table bo-table--compact bo-table--plain" aria-label="Bags declared missing">
                  <thead>
                    <tr>
                      <th>Reason</th>
                      <th className="text-right">Bags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.missing.map((r) => (
                      <tr key={r.reason}>
                        <td>{PARCEL_MISSING_REASON_WORDS[r.reason] ?? r.reason}</td>
                        <td className="text-right tabular-nums">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

function MixTable({ rows, label, first }: { rows: Array<HandoverMixDTO & { key: string; name: string }>; label: string; first: string }) {
  if (rows.length === 0) return <p className="px-5 py-4 text-sm text-muted-foreground">No hand-overs in this period.</p>;
  return (
    <table className="bo-table bo-table--compact bo-table--plain" aria-label={label}>
      <thead>
        <tr>
          <th>{first}</th>
          <th className="text-right">Scanned</th>
          <th className="text-right">Typed</th>
          <th className="text-right">By hand</th>
          <th className="text-right">Scanned share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.name}</td>
            <td className="text-right tabular-nums">{r.scan}</td>
            <td className="text-right tabular-nums">{r.typed}</td>
            <td className="text-right tabular-nums">{r.manual}</td>
            <td className="text-right tabular-nums">{pct(r.scan, total(r))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
