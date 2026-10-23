// The attention evaluator. A scheduled job, because `awaiting_pick` becomes true by time passing: no
// write fires it. It derives attention with `readToday` and `buildAttention`, the Today screen's own
// functions, so a notification always matches what the console lists.
import { announce } from "@effy/edge-shared/live";
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

export interface EvaluatorStats {
  shops: number;
  appeared: number;
  cleared: number;
  intents: number;
  failedShops: number;
}

/** What an item is about, within its kind. `awaiting_pick` is per shop with key "" (never null, or the unique index would not dedupe it). */
export function subjectKeyFor(item: AttentionItem): string {
  switch (item.kind) {
    case "awaiting_pick":
      // "Is there a backlog", not "which orders": one situation.
      return "";
    case "out_of_stock":
    case "low_stock":
      // Stock is per size: restocking one size must not close another.
      return item.variantId;
    case "refund_proposed":
      return item.fulfillmentId;
  }
}

/** The product; its page shows the size. */
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

/** One shop's failure is logged and skipped, never silencing the others. */
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
      // Only shops whose list changed are told, after their transaction commits.
      if (s.appeared > 0 || s.cleared > 0) await announce([{ scope: "shop", shopId: shop.id, kind: "attention" }]);
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

/** In one transaction. */
export async function evaluateShop(
  shopId: string,
): Promise<{ appeared: number; cleared: number; intents: number }> {
  // Proposals are read regardless of role; the role filter applies to recipients, so the occurrence is always recorded.
  const snapshot = await readToday(
    { sub: "", shopId, staffId: null },
    { canRefund: async () => true },
  );

  // `Infinity`, not the card's 8: every occurrence must be recorded.
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
      // Null: a concurrent run inserted it and owns announcing it.
      if (id) appeared.push({ id, kind: item.kind, entityId: entityIdFor(item) });
    }

    // Deleting cleared rows is what makes a recurrence notify again (a new id, a new dedupe key).
    const clearedIds = stored.filter((o) => !seenKeys.has(`${o.kind}\u0000${o.subjectKey}`)).map((o) => o.id);

    await touchOccurrences(tx, stillThere);
    await deleteOccurrences(tx, clearedIds);

    if (appeared.length === 0) {
      return { appeared: 0, cleared: clearedIds.length, intents: 0 };
    }

    // One intent per kind per run, not per item: a stock count can drop forty products at once. New
    // orders are the opposite (one intent each), because batching would delay the first.
    const byKind = new Map<AttentionKind, typeof appeared>();
    for (const a of appeared) {
      const list = byKind.get(a.kind) ?? [];
      list.push(a);
      byKind.set(a.kind, list);
    }

    const recipients = await recipientsForShop(tx, shopId);
    let intents = 0;

    for (const [kind, group] of byKind) {
      // The representative occurrence: its id keys the dedupe and its entity is what the tap opens.
      const lead = group[0]!;
      const type = ATTENTION_TYPE[kind];

      for (const r of recipients) {
        // Manager-only actions are sent only to managers, decided from the platform record.
        if (MANAGER_ONLY_KINDS.includes(kind) && !r.isManager) continue;

        await enqueueIntent(tx, {
          recipientSub: r.sub,
          type,
          entityId: lead.entityId,
          // The occurrence id, never the product or order id.
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
