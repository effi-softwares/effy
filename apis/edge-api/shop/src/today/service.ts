// One snapshot and an attention list: a union of four kinds, so the operator does not do the merge.
import { proposedRefundsForShop } from "@effy/edge-shared";

import { readBacklog, readClock, readLiveOrders, readStockAttention } from "./repository";
import type { AttentionItem, AttentionView, ProposedRefund, TodaySnapshot } from "./types";

/** Every shop's until shops carry their own location. */
export const DEFAULT_TIMEZONE = "Australia/Melbourne";

/** Rows before deferring to "Open queue →". */
export const ATTENTION_LIMIT = 8;
export const LIVE_LIMIT = 5;
/** A few more than shown, so `attentionMore` needs no extra count. */
const STOCK_FETCH = ATTENTION_LIMIT + 1;
const PROPOSAL_FETCH = ATTENTION_LIMIT + 1;

/** Today writes nothing, so it attributes nothing; it reuses the fulfilment gate's Actor. */
export type { Actor } from "../fulfillments/service";
import type { Actor } from "../fulfillments/service";
import type { ShopNextCollectionDTO, ShopOrderCollectionDTO } from "@effy/shared-types";

export interface TodayDeps {
  /** Whether this operator may refund. Injected, and the filter happens here on the server. */
  canRefund: (sub: string) => Promise<boolean>;
  /**
   * The next Effy collection run and the runs the live orders go on (099, `collection/service.ts`).
   * The Today route passes both; the attention evaluator, which only counts what needs a person, does not.
   */
  nextCollection?: (shopId: string, now: Date) => Promise<ShopNextCollectionDTO | null>;
  collectionsFor?: (shopId: string, ids: readonly string[], now: Date) => Promise<Map<string, ShopOrderCollectionDTO>>;
}

export async function readToday(actor: Actor, deps: TodayDeps): Promise<TodaySnapshot> {
  const canRefund = await deps.canRefund(actor.sub);

  // Independent reads issued together: each RDS hop is ~135 ms.
  const [clock, backlog, stock, proposals, live, nextCollection] = await Promise.all([
    readClock(actor.shopId),
    readBacklog(actor.shopId),
    readStockAttention(actor.shopId, STOCK_FETCH),
    canRefund
      ? proposedRefundsForShop(actor.shopId, PROPOSAL_FETCH)
      : Promise.resolve([] as Awaited<ReturnType<typeof proposedRefundsForShop>>),
    readLiveOrders(actor.shopId, LIVE_LIMIT),
    deps.nextCollection ? deps.nextCollection(actor.shopId, new Date()) : Promise.resolve(null),
  ]);
  const collections = deps.collectionsFor
    ? await deps.collectionsFor(actor.shopId, live.map((o) => o.fulfillmentId), new Date())
    : new Map<string, ShopOrderCollectionDTO>();

  // One row per order: the decision a manager makes.
  const byOrder = new Map<string, ProposedRefund>();
  for (const p of proposals) {
    const existing = byOrder.get(p.order_id);
    if (existing) {
      existing.amount = (Number(existing.amount) + Number(p.amount)).toFixed(2);
      if (p.since < existing.since) existing.since = p.since;
      continue;
    }
    byOrder.set(p.order_id, {
      fulfillmentId: p.shop_fulfillment_id,
      orderNumber: p.order_number,
      amount: Number(p.amount).toFixed(2),
      since: p.since,
    });
  }

  return {
    now: clock.now,
    timezone: clock.timezone ?? DEFAULT_TIMEZONE,
    backlog,
    stock,
    proposals: [...byOrder.values()],
    live: live.map((o) => {
      const collection = collections.get(o.fulfillmentId);
      return collection ? { ...o, collection } : o;
    }),
    nextCollection,
  };
}

/**
 * Ordered by cost: owed work (paid orders waiting) first, then an empty shelf, a refund proposal, a
 * low shelf; oldest first within each. The backlog is one row ("go and pick"), not one per order.
 */
export function buildAttention(snapshot: TodaySnapshot, limit = ATTENTION_LIMIT): AttentionView {
  const items: AttentionItem[] = [];

  if (snapshot.backlog.awaitingPick.orders > 0) {
    items.push({
      kind: "awaiting_pick",
      orders: snapshot.backlog.awaitingPick.orders,
      units: snapshot.backlog.awaitingPick.units,
      // Falls back to `now` if a portion has no paid instant.
      since: snapshot.backlog.awaitingPick.oldestPaidAt ?? snapshot.now,
    });
  }

  const out = snapshot.stock.filter((s) => s.severity === "out");
  const low = snapshot.stock.filter((s) => s.severity === "low");

  for (const s of out) {
    items.push({
      kind: "out_of_stock",
      productId: s.productId,
      variantId: s.variantId,
      name: s.name,
      soldLast7Days: s.soldLast7Days,
      since: s.since,
    });
  }
  for (const p of snapshot.proposals) {
    items.push({
      kind: "refund_proposed",
      fulfillmentId: p.fulfillmentId,
      orderNumber: p.orderNumber,
      amount: p.amount,
      since: p.since,
    });
  }
  for (const s of low) {
    items.push({
      kind: "low_stock",
      productId: s.productId,
      variantId: s.variantId,
      name: s.name,
      onHand: s.onHand,
      daysOfCover: s.daysOfCover,
      since: s.since,
    });
  }

  // Over every open item, not just the visible ones.
  const oldestWaitingAt = items.reduce<Date | null>(
    (oldest, i) => (oldest === null || i.since < oldest ? i.since : oldest),
    null,
  );

  return { items: items.slice(0, limit), more: Math.max(0, items.length - limit), oldestWaitingAt };
}
