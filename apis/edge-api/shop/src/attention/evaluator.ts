// The attention evaluator — 059, US3.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ WHY THIS IS A SCHEDULED JOB AND NOT A TRIGGER OR A SERVICE CALL
//
// `awaiting_pick` BECOMES TRUE BY THE PASSAGE OF TIME. An order ages into needing attention; there
// is no INSERT, no UPDATE and no transaction to fire from. Any event-driven design covers three of
// the four conditions and silently misses the most time-critical one, so this is not a preference
// between architectures — it is the only shape that can work.
//
// Two alternatives were considered and refused, both on evidence this repo already paid for:
//   • Database triggers (058's precedent). 058's own `triggers.guard.test.ts` constrains every
//     trigger function in `public` to `pg_notify` + an `ON CONFLICT DO NOTHING` insert, and fails
//     naming the trigger otherwise — correctly. These predicates are joins with thresholds and
//     ordering; they do not belong in one, and the guard already says so.
//   • Per-write application code. That is 054's `availability`-in-14-places defect, which that slice
//     fixed by moving the rule into one place and adding a guard that fails naming the file.
//
// ⚠ ONE DERIVATION, TWO CALLERS (Principle II). This imports `readToday` and `buildAttention` from
// `today/service.ts` — the SAME functions the Today screen calls. It deliberately does NOT re-derive
// anything: if the screen and this job ever disagreed, an operator would be notified about something
// the console does not list, or — worse — not notified about something it does.
//
// ⚠ A DELIBERATE DEVIATION FROM THE PLAN'S T067, recorded rather than silently taken. The plan said
// to extract the derivation into `attention/derive.ts`. Reading the code showed `buildAttention` is
// ALREADY pure, already exported, and already takes its cap as a parameter — so a `derive.ts` would
// be a pass-through module that adds a file and no guarantee. The principle is "one rule, two
// callers", and that is satisfied by importing it. What the cap parameter buys is below.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
import {
  ATTENTION_TYPE,
  MANAGER_ONLY_KINDS,
  logger,
  type AttentionKind,
} from "@effy/edge-shared";

import { buildAttention, readToday } from "../today/service";
import type { AttentionItem } from "../today/types";

import {
  activeShops,
  deleteOccurrences,
  enqueueIntent,
  insertOccurrence,
  markNotified,
  recipientsForShop,
  storedOccurrences,
  touchOccurrences,
  withTransaction,
} from "./repository";

/** What one run did, for the metric and the log. */
export interface EvaluatorStats {
  shops: number;
  appeared: number;
  cleared: number;
  intents: number;
  failedShops: number;
}

/**
 * What an attention item is ABOUT, within its kind.
 *
 * ⚠ `awaiting_pick` IS PER SHOP AND ITS KEY IS THE EMPTY STRING, not null. The column is
 * `NOT NULL text` for exactly this: a nullable uuid would put NULL in the UNIQUE index, where NULL
 * is never equal to itself — so the backlog row would insert again on EVERY run and notify on every
 * run. A console that interrupts an operator every few minutes forever, with a fully green suite.
 */
export function subjectKeyFor(item: AttentionItem): string {
  switch (item.kind) {
    case "awaiting_pick":
      // The operator's question is "is there a backlog", not "which orders" — and the backlog
      // changes composition constantly while remaining one situation.
      return "";
    case "out_of_stock":
    case "low_stock":
      return item.productId;
    case "refund_proposed":
      return item.fulfillmentId;
  }
}

/** The entity a notification for this kind should open. */
function entityIdFor(item: AttentionItem): string {
  switch (item.kind) {
    case "awaiting_pick":
      return "";
    case "out_of_stock":
    case "low_stock":
      return item.productId;
    case "refund_proposed":
      return item.fulfillmentId;
  }
}

/**
 * Evaluate every active shop.
 *
 * ⚠ ONE SHOP'S FAILURE MUST NOT SILENCE THE OTHERS. A shop whose pass throws is logged and skipped;
 * the run continues. 053 recorded the opposite shape as a shipped defect — an unconfigured FCM
 * halted the whole drain — and one shop's bad data taking down every other shop's notifications is
 * the same failure wearing a different hat.
 */
export async function evaluateAll(): Promise<EvaluatorStats> {
  const shops = await activeShops();
  const stats: EvaluatorStats = {
    shops: shops.length,
    appeared: 0,
    cleared: 0,
    intents: 0,
    failedShops: 0,
  };

  for (const shop of shops) {
    try {
      const s = await evaluateShop(shop.id);
      stats.appeared += s.appeared;
      stats.cleared += s.cleared;
      stats.intents += s.intents;
    } catch (err) {
      stats.failedShops += 1;
      logger.error({ err, shopId: shop.id }, "attention: shop evaluation failed, continuing");
    }
  }
  return stats;
}

/** One shop's pass, in ONE transaction. */
export async function evaluateShop(
  shopId: string,
): Promise<{ appeared: number; cleared: number; intents: number }> {
  // ⚠ `canRefund: () => true` — the PROPOSALS ARE READ REGARDLESS OF ROLE, and the role filter is
  // applied to RECIPIENTS below (FR-022). Filtering here instead would mean the occurrence was never
  // recorded at all, so a shop with no manager online would lose the record of a refund waiting —
  // and would then notify about it as brand new the moment one signed in.
  const snapshot = await readToday(
    { sub: "", shopId, staffId: null },
    { canRefund: async () => true },
  );

  // ⚠ `Infinity`, NOT the screen's cap of 8. The card shows the eight most urgent; the evaluator
  // must see EVERY occurrence, or a shop with forty products below threshold would only ever record
  // the first eight and the other thirty-two would be announced one at a time as the earlier ones
  // cleared. This is what the cap being a parameter buys, and why no `derive.ts` was needed.
  const current = buildAttention(snapshot, Number.POSITIVE_INFINITY).items;

  return withTransaction(async (tx) => {
    const stored = await storedOccurrences(tx, shopId);
    const storedByKey = new Map(stored.map((o) => [`${o.kind}\u0000${o.subjectKey}`, o]));

    const seenKeys = new Set<string>();
    const appeared: Array<{ id: string; kind: AttentionKind; entityId: string }> = [];
    const stillThere: string[] = [];

    for (const item of current) {
      const key = `${item.kind}\u0000${subjectKeyFor(item)}`;
      seenKeys.add(key);
      const existing = storedByKey.get(key);
      if (existing) {
        stillThere.push(existing.id);
        continue;
      }
      const id = await insertOccurrence(tx, shopId, item.kind, subjectKeyFor(item));
      // A null id means a concurrent run inserted it first and owns announcing it.
      if (id) appeared.push({ id, kind: item.kind, entityId: entityIdFor(item) });
    }

    // ⚠ Deleting the cleared rows is what makes a recurrence notify again (FR-019) — a condition
    // that comes back gets a new row with a new id, and so a dedupe key the outbox has never seen.
    const clearedIds = stored.filter((o) => !seenKeys.has(`${o.kind}\u0000${o.subjectKey}`)).map((o) => o.id);

    await touchOccurrences(tx, stillThere);
    await deleteOccurrences(tx, clearedIds);

    if (appeared.length === 0) {
      return { appeared: 0, cleared: clearedIds.length, intents: 0 };
    }

    // ── Coalesce (FR-020) ────────────────────────────────────────────────────────────────────────
    //
    // ⚠ ONE INTENT PER KIND PER RUN, NOT ONE PER ITEM. A single stock count can drop forty products
    // below their reorder point at once; forty intents would be forty sends and forty banners — the
    // exact behaviour that trains an operator to dismiss everything, and the exact behaviour
    // browsers now rate-limit (Chrome began returning 429 to high-volume, low-engagement senders in
    // January 2026). The operator opens the queue to see which.
    //
    // ⚠ THIS IS THE OPPOSITE OF WHAT NEW ORDERS DO, deliberately. Each order is a separate intent
    // from a separate checkout transaction, and batching them would delay the first — which is the
    // one SC-001 measures. Attention arrives as a set; orders do not.
    const byKind = new Map<AttentionKind, typeof appeared>();
    for (const a of appeared) {
      const list = byKind.get(a.kind) ?? [];
      list.push(a);
      byKind.set(a.kind, list);
    }

    const recipients = await recipientsForShop(tx, shopId);
    let intents = 0;

    for (const [kind, group] of byKind) {
      // The representative occurrence: the one whose id keys the dedupe and whose entity the
      // notification opens. One per kind per run, by construction.
      const lead = group[0]!;
      const type = ATTENTION_TYPE[kind];

      for (const r of recipients) {
        // ⚠ FR-022 — a notification about an action only a manager may take is not sent to someone
        // who cannot take it. Decided from the PLATFORM RECORD, never a claim and never client-side.
        if (MANAGER_ONLY_KINDS.includes(kind) && !r.isManager) continue;

        await enqueueIntent(tx, {
          recipientSub: r.sub,
          type,
          entityId: lead.entityId,
          // ⚠ THE OCCURRENCE ID, never the product or order id. See `insertOccurrence`.
          dedupeKey: `${type}:${r.sub}:${lead.id}`,
        });
        intents += 1;
      }
    }

    await markNotified(
      tx,
      appeared.map((a) => a.id),
    );

    return { appeared: appeared.length, cleared: clearedIds.length, intents };
  });
}
