// Today's service: compose one snapshot, decide what is worth a person's attention, and in what
// order (058, US1).
//
// ⚠ THE ATTENTION LIST IS A UNION OF FOUR KINDS ON PURPOSE. An operator opening the console asks
// "what needs me?", not "show me orders" and separately "show me stock" and separately "show me
// refunds". Splitting them into three lists makes the person do the merge, which is the job the
// screen exists to do (057 FR-007 said the same about two).
import { proposedRefundsForShop } from "@effy/edge-shared";

import { readBacklog, readClock, readLiveOrders, readStockAttention } from "./repository";
import type { AttentionItem, AttentionView, ProposedRefund, TodaySnapshot } from "./types";

/** The platform's operating timezone — every shop's until shops carry their own location (049 R13). */
export const DEFAULT_TIMEZONE = "Australia/Melbourne";

/** How many rows the card shows before it defers to "Open queue →". */
export const ATTENTION_LIMIT = 8;
/** The design's footer says five, and the five are what the card is for. */
export const LIVE_LIMIT = 5;
/** Read a few more than we show, so `attentionMore` is honest without an extra count query. */
const STOCK_FETCH = ATTENTION_LIMIT + 1;
const PROPOSAL_FETCH = ATTENTION_LIMIT + 1;

/**
 * Today reads nothing that needs a staff id — it writes nothing, so it attributes nothing. Reusing
 * the fulfilment gate's Actor keeps one gate for the whole service (its `staffId` is nullable
 * because 020's audit rows survive a missing operator record).
 */
export type { Actor } from "../fulfillments/service";
import type { Actor } from "../fulfillments/service";

export interface TodayDeps {
  /**
   * Whether this operator may issue a refund (`shop_manager`).
   *
   * ⚠ Injected rather than imported so the decision stays visible at the composition root, and so
   * the service can be tested without a database. The FILTER happens here, on the server: a proposal
   * hidden by CSS is still sent, and "the client won't show it" is not an access control (Principle
   * IV — the record decides).
   */
  canRefund: (sub: string) => Promise<boolean>;
}

export async function readToday(actor: Actor, deps: TodayDeps): Promise<TodaySnapshot> {
  const canRefund = await deps.canRefund(actor.sub);

  // Independent reads, issued together. 029 measured a Sydney RDS round trip at ~135 ms and found a
  // storefront read spending 1.08 s of pure latency on eight serial queries; this screen is polled,
  // so serial reads here would be that defect on a timer.
  const [clock, backlog, stock, proposals, live] = await Promise.all([
    readClock(actor.shopId),
    readBacklog(actor.shopId),
    readStockAttention(actor.shopId, STOCK_FETCH),
    canRefund
      ? proposedRefundsForShop(actor.shopId, PROPOSAL_FETCH)
      : Promise.resolve([] as Awaited<ReturnType<typeof proposedRefundsForShop>>),
    readLiveOrders(actor.shopId, LIVE_LIMIT),
  ]);

  // One proposal row per (portion, order item); the card shows one row per ORDER, because that is
  // the decision a manager makes — 055 groups by item for the refund itself, not for the queue.
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
    live,
  };
}

/**
 * The attention list, ordered and capped.
 *
 * ⚠ THE ORDER IS THE PRODUCT. A shopper has already paid for every order in the pick backlog and is
 * waiting on it, so work that is owed comes before shelves that are thin; an empty shelf costs the
 * next sale, a refund the platform is proposing costs trust, and a low shelf costs neither yet.
 * Within each kind, oldest first — the thing that has been waiting longest is the thing to do next
 * (020 FR-001b makes the same argument for the pick queue).
 *
 * ⚠ THE BACKLOG IS ONE ROW, NOT N. "3 orders awaiting pick" is a single decision — go and pick —
 * and listing three rows would push the out-of-stock product that nobody is watching off the card.
 */
export function buildAttention(snapshot: TodaySnapshot, limit = ATTENTION_LIMIT): AttentionView {
  const items: AttentionItem[] = [];

  if (snapshot.backlog.awaitingPick.orders > 0) {
    items.push({
      kind: "awaiting_pick",
      orders: snapshot.backlog.awaitingPick.orders,
      units: snapshot.backlog.awaitingPick.units,
      // Falls back to `now` only if a portion somehow has no paid instant; the card then reads
      // "waiting 0m" rather than crashing on a null it cannot format.
      since: snapshot.backlog.awaitingPick.oldestPaidAt ?? snapshot.now,
    });
  }

  const out = snapshot.stock.filter((s) => s.severity === "out");
  const low = snapshot.stock.filter((s) => s.severity === "low");

  for (const s of out) {
    items.push({
      kind: "out_of_stock",
      productId: s.productId,
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
      name: s.name,
      onHand: s.onHand,
      daysOfCover: s.daysOfCover,
      since: s.since,
    });
  }

  // ⚠ Computed over EVERY open item, not over the visible ones: "oldest item waiting" is a claim
  // about the shop, and a card that hides the oldest item behind its own cap and then quotes a
  // younger one as the oldest is lying in the most confident possible way.
  const oldestWaitingAt = items.reduce<Date | null>(
    (oldest, i) => (oldest === null || i.since < oldest ? i.since : oldest),
    null,
  );

  return { items: items.slice(0, limit), more: Math.max(0, items.length - limit), oldestWaitingAt };
}
