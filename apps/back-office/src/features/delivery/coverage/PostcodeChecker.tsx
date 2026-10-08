import { useState } from "react";

import type { CoverageCheckDTO } from "@effy/shared-types";
import { COVERAGE_LABEL } from "@effy/shared-types";
import { Button, Input, Label } from "@effy/design-system/ui";

import { COVERAGE_REASON_COPY, coverageError } from "../errorText";
import { checkCoverage } from "../repo";

/**
 * "What about this postcode, and why?" (076 FR-025) — for anyone in back-office, including a
 * customer-service agent with a customer on the line.
 *
 * ⚠ The answer is the SAME function's that checkout asks; this only puts it in words a person can
 * repeat. The reason, the group and the distance are for staff — a customer is told the answer only.
 */
export function PostcodeChecker() {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<CoverageCheckDTO[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMatches(null);
    setBusy(true);
    try {
      setMatches((await checkCoverage(q.trim())).matches);
    } catch (err) {
      setError(coverageError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={check} className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="coverage-check">Check a postcode or place</Label>
          <Input id="coverage-check" className="w-56" placeholder="3121 or Richmond" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" disabled={busy || q.trim().length < 2}>Check</Button>
      </form>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {matches ? (
        matches.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="check-none">No place by that name.</p>
        ) : (
          <ul className="divide-y rounded-md border text-sm" data-testid="check-results">
            {matches.map((m) => (
              <li key={m.postcode} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
                <span className="font-mono tabular-nums">{m.postcode}</span>
                <span className="font-medium">{m.coverage === "none" ? "Cannot deliver" : COVERAGE_LABEL[m.coverage]}</span>
                <span className="text-muted-foreground">{describe(m)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

/** The reason, in the console's own words, with what staff may also know about a listed postcode. */
function describe(m: CoverageCheckDTO): string {
  const parts = [COVERAGE_REASON_COPY[m.reason] ?? ""];
  if (m.reason === "listed") {
    parts.push(m.groupName ? `Group: ${m.groupName}.` : "No group.");
    if (m.distanceKm) parts.push(`${m.distanceKm} km from the hub (${m.distanceSource === "manual" ? "entered by hand" : "worked out"}).`);
  }
  if (m.exclusionReason) parts.push(`Reason: ${m.exclusionReason}.`);
  if (m.places.length > 0) parts.push(`Covers ${m.places.slice(0, 4).join(", ")}${m.places.length > 4 ? ` and ${m.places.length - 4} more` : ""}${m.state ? `, ${m.state}` : ""}.`);
  return parts.filter(Boolean).join(" ");
}
