import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { SamedayDeclarationDTO } from "@effy/shared-types";
import { Button, Input, Label } from "@effy/design-system/ui";
import { ErrorState, PostcodeCoverageNotice } from "@effy/web-kit/console";

import { declarationError } from "./errorText";
import { localitySearchQuery, postcodeCoverageQuery, samedayQuery, useSubmitSameday } from "./queries";

/**
 * The shop's same-day declaration (032 US2).
 *
 * ⚠ SAVING HERE CHANGES NOTHING FOR ANY SHOPPER (FR-017). This is a PROPOSAL: an admin must approve
 * it, and any already-approved version keeps working until they do. The screen says so in as many
 * words, because a shop that believes it just switched same-day on will make promises it cannot keep.
 *
 * ⚠ NO FEE FIELD, and no route to one. What a shopper pays is the platform's decision (FR-008).
 *
 * ⚠ NO CARDS — sectioned page, detail rows, per the design doctrine.
 */
export function SameDayScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(samedayQuery());
  const submit = useSubmitSameday();

  const [offers, setOffers] = useState(false);
  const [cutoff, setCutoff] = useState("");
  const [postcodes, setPostcodes] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed from whatever is currently proposed, else from what is in force. ⚠ Pending wins: it is the
  // shop's most recent intent, and re-seeding from the approved version would silently discard an
  // edit they had already made.
  useEffect(() => {
    const seed = data?.pending ?? data?.inForce;
    if (!seed) return;
    setOffers(seed.offersSameday);
    setCutoff(seed.cutoffTime ?? "");
    setPostcodes(seed.areas.map((a) => a.postcode));
  }, [data]);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  function onSave() {
    setFormError(null);
    setSaved(false);
    submit.mutate(
      { offersSameday: offers, cutoffTime: offers ? cutoff : null, postcodes: offers ? postcodes : [] },
      {
        onSuccess: () => setSaved(true),
        onError: (err) => setFormError(declarationError(err)),
      },
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Same-day delivery</h1>
        <p className="text-sm text-muted-foreground">
          Which areas this shop can reach the same day. Effy sets the delivery price; this is about
          what you can physically deliver.
        </p>
      </div>

      {/* ⚠ FR-020 — both location refusals, explained BEFORE a form is filled in and rejected at the
          end of it. The second is the subtle one: the shop HAS a location, the platform just does not
          know where it is, and every distance on the approval screen would come back blank. */}
      {!data.canDeclare && (
        <section
          data-testid="cannot-declare"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
        >
          <p className="font-medium">This shop cannot declare same-day areas yet.</p>
          <p className="mt-0.5 text-muted-foreground">
            {data.cannotDeclareReason === "shop_location_required"
              ? "No location is recorded for this shop, so how far a customer is cannot be judged. Ask Effy to set the shop's postcode."
              : "This shop's postcode has no known location on the map, so the distance to a customer cannot be worked out. Ask Effy to check the shop's postcode."}
          </p>
        </section>
      )}

      <StatusSection inForce={data.inForce} pending={data.pending} lastDecision={data.lastDecision} />

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-lg font-semibold">Your declaration</h2>

        {/* ⚠ Stated at the point of editing, not buried in a help page. */}
        <p className="text-sm text-muted-foreground">
          Saving sends this to Effy for approval. Nothing changes for customers until it is approved,
          and anything already approved keeps working in the meantime.
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={offers}
            disabled={!data.canDeclare}
            onChange={(e) => setOffers(e.target.checked)}
          />
          This shop offers same-day delivery
        </label>

        {offers && (
          <>
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="cutoff">Cutoff time</Label>
              <Input
                id="cutoff"
                type="time"
                value={cutoff}
                disabled={!data.canDeclare}
                onChange={(e) => setCutoff(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                After this time, same-day is no longer offered for that day.
              </p>
            </div>

            <AreaPicker
              postcodes={postcodes}
              disabled={!data.canDeclare}
              onChange={setPostcodes}
            />
          </>
        )}

        {formError && (
          <p role="alert" data-testid="form-error" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        {saved && !formError && (
          <p role="status" data-testid="submitted" className="text-sm text-muted-foreground">
            Sent to Effy for approval. Nothing has changed for customers yet.
          </p>
        )}

        <Button size="sm" disabled={!data.canDeclare || submit.isPending} onClick={onSave}>
          {submit.isPending ? "Sending…" : "Send for approval"}
        </Button>
      </section>
    </div>
  );
}

/**
 * ⚠ IN FORCE AND PENDING ARE SHOWN AS TWO SEPARATE FACTS (FR-018).
 *
 * Collapsing them into one "current" line would make a shop either believe a pending edit was already
 * live, or believe an approved one had been lost. Both are wrong in ways that end in a broken promise
 * to a shopper.
 */
function StatusSection({
  inForce,
  pending,
  lastDecision,
}: {
  inForce: SamedayDeclarationDTO | null;
  pending: SamedayDeclarationDTO | null;
  lastDecision: SamedayDeclarationDTO | null;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Status</h2>

      <div className="space-y-1.5 border-b pb-3" data-testid="status-in-force">
        <p className="text-sm font-medium">Live now</p>
        {inForce ? (
          <p className="text-sm text-muted-foreground">
            Same-day{inForce.cutoffTime ? ` until ${inForce.cutoffTime}` : ""}, to{" "}
            {inForce.areas.length} {inForce.areas.length === 1 ? "area" : "areas"} —{" "}
            {inForce.areas.map((a) => a.postcode).join(", ")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Effy is not offering same-day from this shop.
          </p>
        )}
      </div>

      {pending && (
        <div className="space-y-1.5 border-b pb-3" data-testid="status-pending">
          <p className="text-sm font-medium">Waiting for approval</p>
          <p className="text-sm text-muted-foreground">
            Sent {new Date(pending.submittedAt).toLocaleDateString()}. Until Effy approves it, the
            version above is what customers get.
          </p>
        </div>
      )}

      {/* ⚠ A decline the shop has not read is at least as important as an approval — it is the only
          place they learn WHY an area they asked for is not being served. */}
      {lastDecision?.status === "declined" && (
        <div className="space-y-1.5" data-testid="status-declined">
          <p className="text-sm font-medium">Last request was declined</p>
          <p className="text-sm text-muted-foreground">
            {lastDecision.decisionNote ?? "No reason was given."}
          </p>
        </div>
      )}

      {/* ⚠ REVOKED and SUPERSEDED are different facts and must read differently: an admin taking
          same-day away is not the same event as the shop's own update going live. */}
      {lastDecision?.status === "revoked" && (
        <div className="space-y-1.5" data-testid="status-revoked">
          <p className="text-sm font-medium">Effy withdrew same-day from this shop</p>
          <p className="text-sm text-muted-foreground">
            {lastDecision.decisionNote ?? "No reason was given."}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Choose areas by NAME (FR-016), never by typing postcodes.
 *
 * ⚠ AND SAY WHAT EACH ONE COVERS. An area is a postcode — picking "Alfredton" commits this shop to
 * all twenty Ballarat localities — and a shop that cannot see that believes it committed to one
 * suburb. `PostcodeCoverageNotice` is the shared component the back office uses for exactly this,
 * fed real coverage from the server.
 */
function AreaPicker({
  postcodes,
  disabled,
  onChange,
}: {
  postcodes: string[];
  disabled: boolean;
  onChange: (p: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const results = useQuery(localitySearchQuery(q));

  return (
    <div className="space-y-3">
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="area-search">Areas you can reach today</Label>
        <Input
          id="area-search"
          value={q}
          disabled={disabled}
          placeholder="Search a suburb, e.g. Alfredton"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {results.data && results.data.length > 0 && q.trim().length >= 2 && (
        <ul data-testid="area-results" className="max-w-sm space-y-1 text-sm">
          {results.data.slice(0, 8).map((l) => (
            <li key={`${l.name}-${l.state}-${l.postcode}`} className="flex items-center justify-between border-b py-1">
              <span>
                {l.name}, {l.state} <span className="text-muted-foreground tabular-nums">{l.postcode}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled || postcodes.includes(l.postcode)}
                onClick={() => {
                  onChange([...new Set([...postcodes, l.postcode])]);
                  setQ("");
                }}
              >
                {postcodes.includes(l.postcode) ? "Added" : "Add"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-3" data-testid="chosen-areas">
        {postcodes.map((p) => (
          <ChosenArea key={p} postcode={p} disabled={disabled} onRemove={() => onChange(postcodes.filter((x) => x !== p))} />
        ))}
        {postcodes.length === 0 && (
          <li className="text-sm text-muted-foreground">No areas chosen yet.</li>
        )}
      </ul>
    </div>
  );
}

function ChosenArea({
  postcode,
  disabled,
  onRemove,
}: {
  postcode: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const coverage = useQuery(postcodeCoverageQuery(postcode));

  return (
    <li className="space-y-1.5 border-b pb-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium tabular-nums">{postcode}</span>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
          Remove
        </Button>
      </div>
      {/* ⚠ REAL coverage from the server, never a hardcoded count. 031 shipped two disclosures wired
          to `siblingCount={0}` and `shops={[]}`, so NEITHER would ever have rendered — the warning
          existed in the code and never once reached a human. */}
      <PostcodeCoverageNotice coverage={coverage.data} />
    </li>
  );
}
