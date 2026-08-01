import type { PostcodeCoverageDTO } from "@effy/shared-types";

/**
 * ⚠ THE FR-006 DISCLOSURE — the single most important interaction in feature 031.
 *
 * ── Why this is its own component ──────────────────────────────────────────────────────────────
 *
 * Serviceability is decided by **postcode**, not by locality. Postcode 3350 covers **20** Ballarat
 * localities; 3550 covers **12** in Bendigo. So an admin who picks "Alfredton" has enabled all twenty.
 *
 * The failure mode is silent and asymmetric: the admin believes they made a narrow decision, there is
 * no error and no log line, and the first evidence otherwise is an order from a suburb they never
 * intended to serve. This is the requirement most likely to be quietly reduced to a tooltip, so it has
 * its own module and its own tests — which makes that harder to do by accident.
 *
 * ⚠ THREE RULES, all binding (contract §2):
 *
 *  1. The count and the list are on screen **at the moment of confirming**. A tooltip, a hover or a
 *     help link does not discharge FR-006.
 *  2. `count` comes from the **server**, never from `places.length` on a list that may be truncated.
 *     The sentence renders `count - 1` — "19 other places" from a count of 20.
 *  3. The **removal** path carries the same disclosure. It is the more dangerous direction: it
 *     silently stops serving customers who were already being served (FR-007).
 *
 * ⚠ SC-003 is an observer test with admins, because "technically displayed" and "actually understood"
 * are different things and only the second prevents the defect.
 */
export interface PostcodeCoverageNoticeProps {
  coverage: PostcodeCoverageDTO | undefined;
  /** `remove` flips the sentence to what STOPS being served — the more dangerous direction (FR-007). */
  mode?: "add" | "remove";
}

export function PostcodeCoverageNotice({ coverage, mode = "add" }: PostcodeCoverageNoticeProps) {
  if (!coverage) return null;

  const { postcode, count, places } = coverage;

  // ⚠ No locality names this postcode — the 3001 case. Not a refusal: the reference record can lag
  // reality, so the admin is warned and asked to confirm deliberately (FR-005).
  if (count === 0) {
    return (
      <p
        role="status"
        data-testid="coverage-unknown"
        className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
      >
        <span className="font-medium">{postcode} is not a recognised delivery destination.</span>{" "}
        No Australian locality uses it — it may be a PO-box or non-residential postcode. Adding it
        anyway needs deliberate confirmation.
      </p>
    );
  }

  const others = count - 1;

  return (
    <div
      role="status"
      data-testid="coverage-notice"
      className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
    >
      {others === 0 ? (
        <p data-testid="coverage-sole">
          <span className="font-medium">{postcode}</span> covers only {places[0]?.name}.
        </p>
      ) : (
        <p data-testid="coverage-many">
          <span className="font-medium">
            {mode === "add"
              ? `This also serves ${others} other ${others === 1 ? "place" : "places"} in ${postcode}.`
              : `Removing this stops serving all ${count} ${count === 1 ? "place" : "places"} in ${postcode}.`}
          </span>
        </p>
      )}

      {others > 0 && (
        // ⚠ The list itself, not just the count. An admin has to be able to see WHICH places — a bare
        // number tells them the scale of the decision but not its content.
        <ul data-testid="coverage-places" className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground">
          {places.map((p) => (
            <li key={`${p.name}-${p.state}`}>{p.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
