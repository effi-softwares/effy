import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { DeliveryExceptionDTO } from "@effy/shared-types";
import { Badge, Button, Checkbox, Label } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { canResolveExceptions } from "./access";
import { exceptionMutationError } from "./errorText";
import { locationLabel, reasonLabel, sortForTriage } from "./model";
import { exceptionsQuery, useResolveException } from "./queries";

/**
 * Deliveries that could not be completed (064, US3).
 *
 * ⚠ THIS SCREEN IS THE READER THAT WENT MISSING TWICE. 056 was built because the driver app "has been
 * recording exceptions for a reader that does not exist" — a drop was marked undeliverable, the
 * package stayed put, and the shopper kept seeing "on the way" indefinitely with nobody at Effy told.
 * 056 built that reader; 063's teardown dropped the tables from under it, leaving neither a writer nor
 * a reader. Without this screen, US2 records exceptions into the same silence all over again.
 *
 * ⚠ A TABLE, NOT METRIC CARDS (Principle V). These are things to work through, not figures to
 * admire, and a card grid would make eight stuck deliveries look like a dashboard rather than a
 * queue. No count at the top for the same reason: the row you can act on beats the number you cannot.
 */
export function ExceptionsScreen() {
  const [includeResolved, setIncludeResolved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const roles = useSessionRoles();
  const canResolve = canResolveExceptions(roles);

  const exceptions = useQuery(exceptionsQuery(includeResolved));
  const resolve = useResolveException();

  async function onResolve(e: DeliveryExceptionDTO) {
    setMessage(null);
    try {
      await resolve.mutateAsync({ id: e.exceptionId, note: null });
    } catch (err) {
      setMessage(exceptionMutationError(err));
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Delivery exceptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deliveries a driver could not complete. Each one has a customer still waiting, so nothing
          here resolves itself.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <Checkbox
          id="include-resolved"
          checked={includeResolved}
          onCheckedChange={(v) => setIncludeResolved(v === true)}
        />
        <Label htmlFor="include-resolved" className="text-sm font-normal">
          Show ones already dealt with
        </Label>
      </div>

      {message ? <p className="text-sm text-destructive">{message}</p> : null}

      {exceptions.isError ? (
        <ErrorState error={exceptions.error} onRetry={() => void exceptions.refetch()} />
      ) : exceptions.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : exceptions.data.exceptions.length === 0 ? (
        /* ⚠ A STATED FACT, not blank space. "Nothing failed" is information; an empty region is
           indistinguishable from a screen that did not load. */
        <section className="rounded-lg border border-border p-6">
          <h2 className="text-base font-medium">Every delivery got through</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No driver has reported a delivery they could not complete.
          </p>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Driver</th>
                <th className="px-3 py-2 font-medium">Destination</th>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium sr-only">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortForTriage(exceptions.data.exceptions).map((e) => (
                <tr key={e.exceptionId} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium tabular-nums">{e.orderNumber}</td>
                  <td className="px-3 py-2">
                    <div>{reasonLabel(e.reason)}</div>
                    {/* The driver's own words, where they left any. Often the only thing that
                        explains a repeat failure at the same address. */}
                    {e.note ? (
                      <div className="mt-1 text-muted-foreground">{e.note}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{e.driverName}</td>
                  <td className="px-3 py-2">{e.destinationSuburb ?? "—"}</td>
                  <td className="px-3 py-2">
                    {/* ⚠ FR-020 — "still in a van" and "back at the hub" are different problems with
                        different urgency, and a list that cannot tell them apart cannot be triaged. */}
                    <Badge variant={e.packageLocation === "with_driver" ? "destructive" : "secondary"}>
                      {locationLabel(e)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {new Date(e.failedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {e.resolvedAt ? (
                      <span className="text-muted-foreground">Dealt with</span>
                    ) : canResolve ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resolve.isPending}
                        onClick={() => void onResolve(e)}
                      >
                        Mark dealt with
                      </Button>
                    ) : (
                      /* ⚠ A csa reads every exception and closes none (FR-021). The absence is
                         explained rather than left as a blank cell — an empty column reads as a
                         broken screen, not as a permission boundary. */
                      <span className="text-muted-foreground">Admin or manager</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
