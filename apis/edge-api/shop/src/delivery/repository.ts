// Repository for a shop's same-day declaration (032) — raw parameterized SQL + explicit row → domain
// mapping (Principle VI, no ORM).
//
// ⚠ Every query is scoped `WHERE shop_id = $1` from the CALLER-RESOLVED shop id, never from client
// input (007's rule). A shop can only ever read or write its own declaration.
import { localitiesForPostcode, query, withTransaction } from "@effy/edge-shared";

import type { Declaration, DeclarationArea, DeclarationInput, DeclarationStatus } from "./types";

interface DeclRow {
  id: string;
  shop_id: string;
  offers_sameday: boolean;
  cutoff_time: string | null;
  status: DeclarationStatus;
  submitted_by: string;
  submitted_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
}

/** The shop's origin, and whether the platform knows where that is (032). */
export interface ShopOrigin {
  postcode: string | null;
  /** ⚠ False when the postcode has no centroid — see CannotDeclareReason in ./types. */
  mappable: boolean;
}

export async function shopOrigin(shopId: string): Promise<ShopOrigin> {
  const res = await query<{ postcode: string | null; mappable: boolean }>(
    `SELECT sh.postcode,
            (c.postcode IS NOT NULL) AS mappable
       FROM public.shop sh
       LEFT JOIN public.postcode_centroid c ON c.postcode = sh.postcode
      WHERE sh.id = $1`,
    [shopId],
  );
  const row = res.rows[0];
  return { postcode: row?.postcode ?? null, mappable: Boolean(row?.mappable) };
}

/**
 * The shop's declarations that matter: the one in force, the one pending, and the last decided one.
 *
 * ⚠ Three separate facts, returned together and never collapsed. FR-018 requires an approved
 * declaration to keep working while a change to it is pending — a single "current" field would have
 * to pick one, and whichever it picked the other would be invisible.
 */
export async function readDeclarations(shopId: string): Promise<{
  inForce: Declaration | null;
  pending: Declaration | null;
  lastDecision: Declaration | null;
}> {
  const res = await query<DeclRow>(
    `SELECT id::text, shop_id::text, offers_sameday,
            to_char(cutoff_time, 'HH24:MI') AS cutoff_time,
            status, submitted_by, submitted_at, decided_by, decided_at, decision_note
       FROM public.shop_sameday_declaration
      WHERE shop_id = $1
      ORDER BY submitted_at DESC`,
    [shopId],
  );
  const rows = res.rows;
  const inForce = rows.find((r) => r.status === "approved") ?? null;
  const pending = rows.find((r) => r.status === "pending") ?? null;
  // ⚠ Most recent DECIDED row, whatever the decision — a decline the shop has not read yet is exactly
  // as important as an approval, and more so if it explains why they are not serving an area.
  const decided = rows.find((r) => r.status !== "pending") ?? null;

  return {
    inForce: inForce ? await hydrate(inForce) : null,
    pending: pending ? await hydrate(pending) : null,
    lastDecision: decided ? await hydrate(decided) : null,
  };
}

async function hydrate(row: DeclRow): Promise<Declaration> {
  return {
    id: row.id,
    shopId: row.shop_id,
    offersSameday: row.offers_sameday,
    cutoffTime: row.cutoff_time,
    status: row.status,
    areas: await areasFor(row.id),
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at.toISOString(),
    decidedBy: row.decided_by,
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    decisionNote: row.decision_note,
  };
}

/**
 * A declaration's areas, each carrying what its postcode actually covers.
 *
 * ⚠ The coverage is not decoration. An area IS a postcode, so "Alfredton" means all twenty Ballarat
 * localities — and a shop that cannot see that believes it committed to one suburb.
 */
async function areasFor(declarationId: string): Promise<DeclarationArea[]> {
  const res = await query<{ postcode: string }>(
    `SELECT postcode FROM public.shop_sameday_area WHERE declaration_id = $1 ORDER BY postcode`,
    [declarationId],
  );
  return Promise.all(
    res.rows.map(async (r) => {
      const places = await localitiesForPostcode(r.postcode);
      return { postcode: r.postcode, places: places.map((p) => p.name), localityCount: places.length };
    }),
  );
}

/** Postcodes among these that no locality names — the 3001 case (031), on a second surface. */
export async function unknownPostcodes(postcodes: string[]): Promise<string[]> {
  if (postcodes.length === 0) return [];
  const res = await query<{ postcode: string }>(
    `SELECT p.postcode
       FROM unnest($1::text[]) AS p(postcode)
       LEFT JOIN public.locality l ON l.postcode = p.postcode
      WHERE l.postcode IS NULL
      GROUP BY p.postcode`,
    [postcodes],
  );
  return res.rows.map((r) => r.postcode);
}

/**
 * Submit a declaration: replace any PENDING version, leave any APPROVED one untouched.
 *
 * ⚠ THE UNTOUCHED APPROVED ROW IS THE WHOLE POINT (FR-018). If this updated the approved row instead
 * of inserting a new pending one, a shop adjusting its cutoff would silently revoke its own live
 * same-day service — no error, no log line, and the first evidence would be shoppers quietly losing
 * an option.
 *
 * ⚠ Delete-then-insert inside one transaction, guarded by the partial unique index
 * `shop_sameday_one_pending_uq`. Two concurrent submits therefore cannot leave two pending rows; the
 * loser fails on the constraint rather than corrupting the state.
 */
export async function submitDeclaration(
  shopId: string,
  input: DeclarationInput,
  submittedBy: string,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM public.shop_sameday_declaration WHERE shop_id = $1 AND status = 'pending'`,
      [shopId],
    );
    const ins = await client.query<{ id: string }>(
      `INSERT INTO public.shop_sameday_declaration
           (shop_id, offers_sameday, cutoff_time, status, submitted_by)
           VALUES ($1, $2, $3, 'pending', $4)
        RETURNING id`,
      [shopId, input.offersSameday, input.cutoffTime, submittedBy],
    );
    const declarationId = ins.rows[0]!.id;
    for (const postcode of input.postcodes) {
      await client.query(
        `INSERT INTO public.shop_sameday_area (declaration_id, postcode) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [declarationId, postcode],
      );
    }
  });
}
