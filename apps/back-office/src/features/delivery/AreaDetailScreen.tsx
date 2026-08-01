import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { AreaServiceLevelForm } from "./components/AreaServiceLevelForm";
import { areaQuery, useConfigureArea, useMarkAreaNotServed } from "./queries";

/**
 * Everything one delivery area gets, on one screen (031 FR-022).
 *
 * ⚠ WHY THIS SCREEN EXISTS. Operations asks "what does Ballarat get?"; the platform stored "what does
 * MEL-METRO → REGIONAL get, per method?". With two zones that is four pairs. With ten it is ninety
 * across three methods, and nobody can answer the question they actually have without reading a grid.
 *
 * ⚠ NO CARDS — a sectioned detail page with rows, per the design doctrine.
 */
export function AreaDetailScreen({ zoneId, postcode }: { zoneId: string; postcode: string }) {
  const { data: area, error, isPending, isError, refetch } = useQuery(areaQuery(zoneId, postcode));
  const configure = useConfigureArea(zoneId, postcode);
  const notServed = useMarkAreaNotServed(zoneId, postcode);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending || !area) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tabular-nums">{area.postcode}</h1>
        <p className="text-sm text-muted-foreground">
          {area.zoneCode}
          {area.places.length > 0 && (
            <>
              {" · "}
              {area.places.map((p) => p.name).join(", ")}
            </>
          )}
        </p>
      </div>

      {/* ⚠ THE THREE STATES, RENDERED THREE DIFFERENT WAYS.
          "Deliberately not served" and "not configured yet" are the two meanings that were fused into
          one absent row before this feature. Fusing them again here would undo the whole point of the
          migration — which is exactly what SC-006 asks five admins to tell apart. */}
      {area.state === "not_served" && (
        <section data-testid="state-not-served" className="rounded-md border px-3 py-2">
          <p className="text-sm font-medium">Deliberately not served</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Decided by {area.decision?.decidedBy} on{" "}
            {area.decision?.decidedAt ? new Date(area.decision.decidedAt).toLocaleDateString() : "—"}
            {area.decision?.note ? ` — ${area.decision.note}` : ""}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This area has been withdrawn from {area.zoneCode}. Shoppers here are told Effy does not
            deliver to them.
          </p>
        </section>
      )}

      {area.state === "unconfigured" && (
        <section data-testid="state-unconfigured" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
          <p className="text-sm font-medium">Not configured yet</p>
          {/* ⚠ Stated in terms of what the SHOPPER experiences. "No active offering" means nothing to
              the person who has to fix it — this is the REGIONAL defect, described. */}
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nobody has decided about this area. Shoppers here are told Effy delivers to them, and then
            cannot complete checkout. Configure a service level below, or record that it is not served.
          </p>
        </section>
      )}

      {area.state !== "not_served" && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What this area gets</h2>
          <AreaServiceLevelForm
            area={area}
            siblingCount={area.siblingPostcodes.length}
            shops={area.shops}
            saving={configure.isPending}
            onSave={(levels) => configure.mutate({ serviceLevels: levels })}
          />
        </section>
      )}

      {area.state !== "not_served" && (
        <section className="space-y-2 border-t pt-4">
          <h2 className="text-sm font-medium">Stop serving this area</h2>
          <p className="text-sm text-muted-foreground">
            Records a deliberate decision and withdraws the area, so shoppers here are told plainly
            that Effy does not deliver to them.
          </p>
          {confirming ? (
            <div className="space-y-2">
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Why? (optional, but the next admin will thank you)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={notServed.isPending}
                  onClick={() => notServed.mutate({ note: note || null })}
                >
                  {notServed.isPending ? "Saving…" : "Mark not served"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              Mark not served
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
