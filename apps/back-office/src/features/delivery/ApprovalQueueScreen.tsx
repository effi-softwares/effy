import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { DeclarationAreaReviewDTO, DeclarationReviewDTO } from "@effy/shared-types";
import { Button, Input } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { deliveryMutationError } from "./errorText";
import { declarationQueueQuery, useDecideDeclaration } from "./queries";

/**
 * Same-day approvals (032 US3).
 *
 * ⚠ WHY AN ADMIN IS SHOWN A DISTANCE AT ALL (FR-023).
 *
 * The check this replaces asked "is any shop in this area's zone?". Zone REGIONAL holds both Ballarat
 * and Bendigo, so same-day to Ballarat was permitted by a shop in Bendigo — 98 km away, essentially as
 * far as Melbourne. It reported "a shop is nearby" and carried no information whatsoever. An admin
 * approving without the number is making that same mistake by hand.
 *
 * ⚠ NO CARDS — a table, which is what a queue wants anyway.
 */
export function ApprovalQueueScreen() {
  const [status, setStatus] = useState("pending");
  const { data, error, isPending, isError, refetch } = useQuery(declarationQueueQuery(status));

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Same-day approvals</h1>
        <p className="text-sm text-muted-foreground">
          Shops declare which areas they can reach the same day. Nothing they declare reaches a
          customer until it is approved here.
        </p>
      </div>

      <div className="flex gap-2">
        {(["pending", "approved", "all"] as const).map((s) => (
          <Button key={s} variant={status === s ? "default" : "outline"} size="sm" onClick={() => setStatus(s)}>
            {s === "pending" ? "Awaiting decision" : s === "approved" ? "In force" : "All"}
          </Button>
        ))}
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="queue-empty">
          {status === "pending" ? "Nothing is waiting for a decision." : "Nothing to show."}
        </p>
      ) : (
        <table className="w-full text-sm" data-testid="queue-table">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 font-medium">Shop</th>
              <th className="py-1.5 font-medium">Areas</th>
              {/* ⚠ "Straight-line", not "distance". Calling it distance invites an admin to read it as
                  road distance and decide on a figure ~7% optimistic — replacing one misleading
                  signal with another would be worse than leaving it alone. */}
              <th className="py-1.5 font-medium">Furthest (straight-line)</th>
              <th className="py-1.5 font-medium">Submitted</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <QueueRow key={d.id} declaration={d} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function QueueRow({ declaration: d }: { declaration: DeclarationReviewDTO }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-b" data-testid={`queue-row-${d.id}`}>
        <td className="py-2">{d.shopName}</td>
        <td className="py-2 tabular-nums">{d.areas.length}</td>
        <td className="py-2" data-testid={`furthest-${d.id}`}>
          {formatKm(d.furthestKm)}
        </td>
        <td className="py-2">{new Date(d.submittedAt).toLocaleDateString()}</td>
        <td className="py-2 text-right">
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Review"}
          </Button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="py-3">
            <DeclarationDetail declaration={d} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * ⚠ NULL IS NOT ZERO, AND MUST NOT LOOK LIKE "CLOSE".
 *
 * A blank cell or a "0 km" would be the most reassuring possible rendering of the least information —
 * on the one screen whose entire purpose is to say how far away something is. Exported for its test.
 */
export function formatKm(km: number | null): string {
  return km === null ? "no location on record" : `${km} km`;
}

function DeclarationDetail({ declaration: d }: { declaration: DeclarationReviewDTO }) {
  const decide = useDecideDeclaration(d.id);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function run(action: "approve" | "decline" | "revoke") {
    setFormError(null);
    // ⚠ A decline or a revoke with no reason is refused by the SERVER (FR-024); the button is
    // disabled to match, never as a substitute for the check.
    decide.mutate(
      { action, body: { note: note.trim() || null } },
      { onError: (err) => setFormError(deliveryMutationError(err)) },
    );
  }

  const needsNote = !note.trim();

  return (
    <div className="space-y-4 rounded-md border px-3 py-3">
      <p className="text-sm text-muted-foreground">
        {d.shopName}
        {d.shopPostcode ? ` · ${d.shopPostcode}` : ""}
        {d.cutoffTime ? ` · cutoff ${d.cutoffTime}` : ""}
      </p>

      <table className="w-full text-sm" data-testid={`areas-${d.id}`}>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 font-medium">Area</th>
            <th className="py-1.5 font-medium">Covers</th>
            <th className="py-1.5 font-medium">Straight-line distance</th>
          </tr>
        </thead>
        <tbody>
          {d.areas.map((a) => (
            <AreaRow key={a.postcode} area={a} />
          ))}
        </tbody>
      </table>

      <div className="space-y-2">
        <Input
          aria-label="Reason"
          placeholder="Reason — required to decline or withdraw; the shop reads this"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {formError && (
          <p role="alert" className="text-sm text-destructive" data-testid={`error-${d.id}`}>
            {formError}
          </p>
        )}
        <div className="flex gap-2">
          {d.status === "pending" && (
            <>
              <Button size="sm" disabled={decide.isPending} onClick={() => run("approve")}>
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={decide.isPending || needsNote}
                onClick={() => run("decline")}
              >
                Decline
              </Button>
            </>
          )}
          {d.status === "approved" && (
            <Button
              variant="destructive"
              size="sm"
              disabled={decide.isPending || needsNote}
              onClick={() => run("revoke")}
            >
              Withdraw same-day
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AreaRow({ area: a }: { area: DeclarationAreaReviewDTO }) {
  return (
    <tr className="border-b" data-testid={`area-${a.postcode}`}>
      <td className="py-1.5 tabular-nums">{a.postcode}</td>
      <td className="py-1.5 text-muted-foreground">
        {/* ⚠ An area IS a postcode: approving "3350" approves all twenty Ballarat localities. The
            count is the disclosure, and it comes from the server — never from places.length on a
            list that may have been truncated. */}
        {a.localityCount} {a.localityCount === 1 ? "place" : "places"}
        {a.places.length > 0 ? ` — ${a.places.slice(0, 3).join(", ")}${a.localityCount > 3 ? "…" : ""}` : ""}
      </td>
      <td className="py-1.5" data-testid={`area-km-${a.postcode}`}>
        {formatKm(a.straightLineKm)}
      </td>
    </tr>
  );
}
