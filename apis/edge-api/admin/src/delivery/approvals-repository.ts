// Repository for same-day declaration APPROVALS (032 US3) — raw parameterized SQL + explicit row →
// domain mapping (Principle VI, no ORM).
//
// ⚠ The distance an admin sees is computed HERE, from public.postcode_centroid, and never reaches a
// customer response. See straightLineKm in ./types for why the name matters.
import { localitiesForPostcode, query, withTransaction } from "@effy/edge-shared";

import { greatCircleKm } from "./distance";
import type { DeclarationAreaReview, DeclarationReview, DeclarationStatus } from "./types";
import { DeliveryError } from "./types";

interface ReviewRow {
  id: string;
  shop_id: string;
  shop_name: string;
  shop_postcode: string | null;
  shop_lat: number | null;
  shop_lon: number | null;
  offers_sameday: boolean;
  cutoff_time: string | null;
  status: DeclarationStatus;
  submitted_by: string;
  submitted_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
}

const SELECT_REVIEW = `
SELECT d.id::text, d.shop_id::text, sh.name AS shop_name, sh.postcode AS shop_postcode,
       c.latitude::float8  AS shop_lat,
       c.longitude::float8 AS shop_lon,
       d.offers_sameday,
       to_char(d.cutoff_time, 'HH24:MI') AS cutoff_time,
       d.status, d.submitted_by, d.submitted_at, d.decided_by, d.decided_at, d.decision_note
  FROM public.shop_sameday_declaration d
  JOIN public.shop sh ON sh.id = d.shop_id
  -- ⚠ LEFT JOIN: a shop whose postcode has no centroid still appears in the queue. Hiding it would
  -- make an unapprovable declaration invisible rather than visibly unapprovable.
  LEFT JOIN public.postcode_centroid c ON c.postcode = sh.postcode
`;

/** The queue, optionally filtered by status (defaults to what needs a decision). */
export async function listDeclarations(status: DeclarationStatus | null): Promise<DeclarationReview[]> {
  const res = await query<ReviewRow>(
    `${SELECT_REVIEW} WHERE ($1::text IS NULL OR d.status = $1) ORDER BY d.submitted_at ASC`,
    [status],
  );
  return Promise.all(res.rows.map(hydrate));
}

export async function getDeclaration(id: string): Promise<DeclarationReview | null> {
  const res = await query<ReviewRow>(`${SELECT_REVIEW} WHERE d.id = $1`, [id]);
  const row = res.rows[0];
  return row ? hydrate(row) : null;
}

async function hydrate(row: ReviewRow): Promise<DeclarationReview> {
  const areas = await areasFor(row.id, row.shop_lat, row.shop_lon);
  const known = areas.map((a) => a.straightLineKm).filter((km): km is number => km !== null);
  return {
    id: row.id,
    shopId: row.shop_id,
    shopName: row.shop_name,
    shopPostcode: row.shop_postcode,
    offersSameday: row.offers_sameday,
    cutoffTime: row.cutoff_time,
    status: row.status,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at.toISOString(),
    decidedBy: row.decided_by,
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    decisionNote: row.decision_note,
    areas,
    // ⚠ Null, not 0, when nothing is measurable. A "0 km furthest area" in a queue table would read
    // as "everything is next door" — the most reassuring possible rendering of the least information.
    furthestKm: known.length > 0 ? Math.max(...known) : null,
  };
}

/**
 * Each requested area with its coverage and its distance from the shop.
 *
 * ⚠ THE DISTANCE IS THE WHOLE POINT OF THE APPROVAL SCREEN (FR-023). 031's guard asked "is any shop
 * in this area's zone?", which permitted same-day to Ballarat from a shop in Bendigo — 98 km, as far
 * as Melbourne. It reported "a shop is nearby" and carried no information. An admin approving without
 * seeing the number is making exactly that mistake by hand.
 */
async function areasFor(
  declarationId: string,
  shopLat: number | null,
  shopLon: number | null,
): Promise<DeclarationAreaReview[]> {
  const res = await query<{ postcode: string; lat: number | null; lon: number | null }>(
    `SELECT a.postcode,
            c.latitude::float8  AS lat,
            c.longitude::float8 AS lon
       FROM public.shop_sameday_area a
       LEFT JOIN public.postcode_centroid c ON c.postcode = a.postcode
      WHERE a.declaration_id = $1
      ORDER BY a.postcode`,
    [declarationId],
  );

  return Promise.all(
    res.rows.map(async (r) => {
      const places = await localitiesForPostcode(r.postcode);
      return {
        postcode: r.postcode,
        places: places.map((p) => p.name),
        // ⚠ From the DATABASE, not from places.length — the list could be truncated upstream and a
        // client counting what it was handed says "1 other place" when there are twenty.
        localityCount: places.length,
        straightLineKm: greatCircleKm(shopLat, shopLon, r.lat, r.lon),
      };
    }),
  );
}

// ── Decisions ─────────────────────────────────────────────────────────────────────────────────

/**
 * Approve a pending declaration.
 *
 * ⚠ TWO WRITES, ONE TRANSACTION, IN THIS ORDER: the in-force row is retired FIRST, then the pending
 * row becomes approved. `shop_sameday_one_in_force_uq` is a PARTIAL UNIQUE INDEX and is NOT
 * deferrable, so doing it the other way round raises 23505 — which is 022's exact lesson, where a
 * "set the new default, clear the old" CTE meant promoting a default had never once worked.
 *
 * ⚠ The retired row becomes `superseded`, NOT `revoked`. An admin taking same-day away and a shop's
 * own update going live are different events, and a shop reading its history must be able to tell
 * them apart.
 */
export async function approveDeclaration(id: string, actorSub: string, note: string | null): Promise<void> {
  await withTransaction(async (client) => {
    const target = await client.query<{ shop_id: string; status: string }>(
      `SELECT shop_id::text, status FROM public.shop_sameday_declaration WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = target.rows[0];
    if (!row) throw new DeliveryError("not_found", "declaration not found");
    if (row.status !== "pending") {
      throw new DeliveryError("conflict", `this declaration is ${row.status}, not awaiting a decision`);
    }

    await client.query(
      `UPDATE public.shop_sameday_declaration
          SET status = 'superseded', decided_by = $2, decided_at = now()
        WHERE shop_id = $1 AND status = 'approved'`,
      [row.shop_id, actorSub],
    );
    await client.query(
      `UPDATE public.shop_sameday_declaration
          SET status = 'approved', decided_by = $2, decided_at = now(), decision_note = $3,
              supersedes_id = (
                SELECT id FROM public.shop_sameday_declaration
                 WHERE shop_id = $4 AND status = 'superseded'
                 ORDER BY decided_at DESC LIMIT 1)
        WHERE id = $1`,
      [id, actorSub, note, row.shop_id],
    );
    await audit(client, actorSub, "delivery_declaration.approve", id, { shopId: row.shop_id, note });
  });
}

/** Decline a pending declaration. ⚠ The reason is required by the service — the shop must be able to read WHY. */
export async function declineDeclaration(id: string, actorSub: string, note: string): Promise<void> {
  await withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE public.shop_sameday_declaration
          SET status = 'declined', decided_by = $2, decided_at = now(), decision_note = $3
        WHERE id = $1 AND status = 'pending'`,
      [id, actorSub, note],
    );
    if (res.rowCount === 0) throw new DeliveryError("conflict", "this declaration is not awaiting a decision");
    await audit(client, actorSub, "delivery_declaration.decline", id, { note });
  });
}

/**
 * Withdraw an approval already in force (FR-025).
 *
 * ⚠ `revoked`, not `superseded` — see the note on approveDeclaration. This is a person taking
 * something away, and the shop is owed both the fact and the reason.
 */
export async function revokeDeclaration(id: string, actorSub: string, note: string): Promise<void> {
  await withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE public.shop_sameday_declaration
          SET status = 'revoked', decided_by = $2, decided_at = now(), decision_note = $3
        WHERE id = $1 AND status = 'approved'`,
      [id, actorSub, note],
    );
    if (res.rowCount === 0) throw new DeliveryError("conflict", "this declaration is not in force");
    await audit(client, actorSub, "delivery_declaration.revoke", id, { note });
  });
}

async function audit(
  client: { query: (text: string, values: unknown[]) => Promise<unknown> },
  actorSub: string,
  action: string,
  targetId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
          VALUES ($1, $2, 'shop_sameday_declaration', $3, $4::jsonb)`,
    [actorSub, action, targetId, JSON.stringify(detail)],
  );
}
