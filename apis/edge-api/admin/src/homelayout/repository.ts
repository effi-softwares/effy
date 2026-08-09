// Data layer for the home layout (042). Raw SQL, no ORM (constitution).
//
// ⚠ EVERY MUTATION WRITES `admin.audit_log` INSIDE THE SAME TRANSACTION AS THE CHANGE (FR-015, the
// 009 pattern). An audit row written afterwards is an audit row that can be missing — and the one
// time it goes missing is the one time someone needs it.
//
// ⚠ EVERY MUTATION IS ALSO CONDITIONAL ON A REVISION (FR-017). `WHERE revision = $n` with a bump in
// the same statement is what makes a concurrent publish a refusal rather than a silent overwrite.
// Postgres serialises the two UPDATEs on the row, so the loser genuinely affects zero rows — there is
// no window between a check and a write for this to slip through, which is why the check is not done
// in the service.
import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import { type HomeLayout, type LayoutBody, conflict } from "./types";

interface LayoutRow {
  draft: LayoutBody;
  published: LayoutBody;
  revision: string;
  published_at: Date | null;
  published_by: string | null;
  updated_at: Date;
  updated_by: string | null;
}

function toDomain(r: LayoutRow): HomeLayout {
  return {
    draft: r.draft ?? [],
    published: r.published ?? [],
    // ⚠ `bigint` arrives from node-postgres as a STRING, because it does not fit a JS number in
    // general. Number() is safe at this magnitude and the conversion is done once, here, so nothing
    // downstream has to know the column's width.
    revision: Number(r.revision),
    publishedAt: r.published_at ? r.published_at.toISOString() : null,
    publishedBy: r.published_by,
    updatedAt: r.updated_at.toISOString(),
    updatedBy: r.updated_by,
  };
}

const SELECT = `SELECT draft, published, revision, published_at, published_by, updated_at, updated_by
                  FROM public.home_layout WHERE singleton`;

/**
 * The whole layout, both bodies.
 *
 * ⚠ The migration seeds the singleton row, so its absence means the migration has not been applied —
 * a deployment fault, not an empty state. Returning a fabricated empty layout would hide that behind
 * a composer that appears to work and silently discards everything the operator does.
 */
export async function readLayout(): Promise<HomeLayout | null> {
  const res = await query<LayoutRow>(SELECT);
  const row = res.rows[0];
  return row ? toDomain(row) : null;
}

async function insertAudit(
  client: PoolClient,
  actorSub: string,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
          VALUES ($1, $2, 'home_layout', NULL, $3::jsonb)`,
    [actorSub, action, JSON.stringify(detail)],
  );
}

/** Replace the draft body. Publishing is a separate act — this never touches what shoppers see. */
export async function writeDraft(
  body: LayoutBody,
  revision: number,
  actorSub: string,
): Promise<HomeLayout> {
  await withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE public.home_layout
          SET draft = $1::jsonb, revision = revision + 1, updated_by = $2, updated_at = now()
        WHERE singleton AND revision = $3`,
      [JSON.stringify(body), actorSub, revision],
    );
    if (res.rowCount === 0) throw conflict();
    // ⚠ The block COUNT and TYPES are audited, not the bodies. An audit row per keystroke-sized save
    // carrying the full page would make the log unreadable and store operator copy twice; what an
    // auditor needs is who changed the shape of the page and when.
    await insertAudit(client, actorSub, "home_layout.draft_save", {
      blockCount: body.length,
      types: body.map((b) => b.type),
    });
  });
  return mustRead();
}

/**
 * Publish the draft — the only write shoppers ever see.
 *
 * ⚠ `published = draft` IS COPIED IN SQL RATHER THAN ROUND-TRIPPED THROUGH THE SERVICE. Reading the
 * draft, validating it and writing it back would publish whatever the service *read*, which is not
 * necessarily what is in the column by the time the write lands. Copying inside the statement, under
 * the revision condition, makes "publish exactly the draft that was validated" true by construction.
 */
export async function publish(revision: number, actorSub: string): Promise<HomeLayout> {
  await withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE public.home_layout
          SET published = draft, revision = revision + 1,
              published_by = $1, published_at = now(), updated_by = $1, updated_at = now()
        WHERE singleton AND revision = $2`,
      [actorSub, revision],
    );
    if (res.rowCount === 0) throw conflict();
    await insertAudit(client, actorSub, "home_layout.publish", {});
  });
  return mustRead();
}

/**
 * Discard the draft and return it to the last published state (FR-014).
 *
 * ⚠ THIS IS "UNDO MY EDITS", NOT "UNDO MY PUBLISH". With two bodies and no history there is nothing
 * behind `published` to go back to — a fact worth stating plainly rather than letting an operator
 * discover it at the moment they most need the other behaviour. The composer's copy says so too.
 */
export async function revert(revision: number, actorSub: string): Promise<HomeLayout> {
  await withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE public.home_layout
          SET draft = published, revision = revision + 1, updated_by = $1, updated_at = now()
        WHERE singleton AND revision = $2`,
      [actorSub, revision],
    );
    if (res.rowCount === 0) throw conflict();
    await insertAudit(client, actorSub, "home_layout.revert", {});
  });
  return mustRead();
}

export interface AuditEntry {
  id: string;
  actorSub: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

/** Who changed the page and when (FR-015). Newest first, bounded. */
export async function readAudit(limit = 50): Promise<AuditEntry[]> {
  const res = await query<{
    id: string;
    actor_sub: string;
    action: string;
    detail: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, actor_sub, action, detail, created_at
       FROM admin.audit_log
      WHERE target_type = 'home_layout'
      ORDER BY created_at DESC
      LIMIT $1`,
    [Math.min(Math.max(Math.floor(limit), 1), 200)],
  );
  return res.rows.map((r) => ({
    id: r.id,
    actorSub: r.actor_sub,
    action: r.action,
    detail: r.detail ?? {},
    createdAt: r.created_at.toISOString(),
  }));
}

async function mustRead(): Promise<HomeLayout> {
  const layout = await readLayout();
  // Unreachable in practice — the write above just succeeded against this row inside a transaction
  // that has committed. Thrown rather than asserted so a genuinely impossible state is loud.
  if (!layout) throw new Error("home_layout row vanished after a successful write");
  return layout;
}
