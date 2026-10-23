/**
 * The promotion evaluator. Pure: no I/O, no clock of its own, cents throughout. The cart, the payment
 * intent and the back-office preview all call `pricePromotions`, so cart, charge and receipt agree
 * (`promotions.guard.test.ts` fails a second evaluator).
 *
 * Order: item promotions per qualifying unit, then buy-X-get-Y on what is left; cart promotions on the
 * remaining goods; delivery promotions on the order's one fee. Percentages round down per line; a cart
 * or capped discount is allocated to its lines in proportion, largest remainder first, so every line
 * carries its exact cents (refunds read them). Nothing goes below zero.
 *
 * Combining: every combinable candidate applies together, unless one non-combinable candidate alone
 * gives more; ties go to the one ending soonest, then the oldest.
 */

export type EngineKind = "cart" | "item" | "bxgy" | "delivery";
export type EngineValueType = "percent" | "amount" | "free";
export type DeliveryTypeName = "effy" | "courier";

export interface BasketLine {
  lineId: string;
  productId: string;
  /** The product's category and every ancestor, so a category target covers sub-categories. */
  categoryIds: readonly string[];
  /** Lower-cased and trimmed, or null. */
  brand: string | null;
  unitCents: number;
  quantity: number;
}

export interface Basket {
  lines: readonly BasketLine[];
  /** Null while it is not yet known (the cart before a delivery choice). */
  deliveryType: DeliveryTypeName | null;
  /** The delivery fee before promotions; null before a quote (the cart). */
  deliveryFeeCents: number | null;
}

export interface Candidate {
  id: string;
  name: string;
  headline: string | null;
  kind: EngineKind;
  valueType: EngineValueType;
  percentOff: number | null;
  amountOffCents: number | null;
  maxDiscountCents: number | null;
  bxgy: { buy: number; get: number; maxPerOrder: number | null } | null;
  appliesTo: "cart" | "products" | "categories" | "brands";
  targets: { productIds: ReadonlySet<string>; categoryIds: ReadonlySet<string>; brands: ReadonlySet<string> };
  deliveryTypes: readonly DeliveryTypeName[];
  minSubtotalCents: number;
  minQuantity: number | null;
  /** ISO 1 (Mon) – 7 (Sun), Melbourne. Null = every day. */
  daysOfWeek: readonly number[] | null;
  /** Minutes after Melbourne midnight. Both or neither. */
  minuteFrom: number | null;
  minuteTo: number | null;
  combinable: boolean;
  endsAt: Date | null;
  createdAt: Date;
  /** What is left of its budget, or null for no budget. A use is applied only if it fits whole. */
  budgetLeftCents: number | null;
  /** Set when the shopper entered this promotion's code. */
  codeId: string | null;
  codeText: string | null;
}

/** Melbourne's day and minute, worked out by the caller from the clock it was given. */
export interface EngineContext {
  isoDay: number;
  minuteOfDay: number;
}

export type NotAppliedReason =
  | "not_combined"
  | "below_minimum"
  | "below_quantity"
  | "wrong_time"
  | "wrong_delivery"
  | "nothing_to_discount"
  | "over_budget";

export interface NotApplied {
  promotionId: string;
  reason: NotAppliedReason;
  /** For below_minimum: how much more to spend. */
  shortfallCents?: number;
  /** For below_quantity: how many more qualifying items. */
  missingQuantity?: number;
}

export interface AppliedPromotion {
  promotionId: string;
  codeId: string | null;
  codeText: string | null;
  kind: EngineKind;
  goodsCents: number;
  deliveryCents: number;
  /** Cents this promotion took off each line it touched. */
  lines: { lineId: string; cents: number }[];
  /** A delivery promotion that applies but has no fee to reduce yet (the cart). */
  awaitingDeliveryFee: boolean;
}

export interface PromotionOutcome {
  applied: AppliedPromotion[];
  /** Total cents off each line, across every applied promotion. */
  lineDiscounts: Record<string, number>;
  goodsDiscountCents: number;
  deliveryDiscountCents: number;
  notApplied: NotApplied[];
}

const EMPTY: PromotionOutcome = { applied: [], lineDiscounts: {}, goodsDiscountCents: 0, deliveryDiscountCents: 0, notApplied: [] };

/** Price every candidate against the basket and choose what applies. */
export function pricePromotions(basket: Basket, candidates: readonly Candidate[], ctx: EngineContext): PromotionOutcome {
  if (candidates.length === 0) return EMPTY;

  // Each candidate alone: does it give anything, and if not, why.
  const alone = new Map<string, Evaluation>();
  const refused: NotApplied[] = [];
  const live: Candidate[] = [];
  for (const c of candidates) {
    const gate = gateOf(c, basket, ctx);
    if (gate) {
      refused.push({ promotionId: c.id, reason: gate });
      continue;
    }
    const ev = evaluate(basket, [c]);
    const one = ev.applied[0];
    const why = ev.refused[0];
    if (why) {
      refused.push(why);
      continue;
    }
    if (!one || (one.goodsCents + one.deliveryCents === 0 && !one.awaitingDeliveryFee)) {
      refused.push({ promotionId: c.id, reason: "nothing_to_discount" });
      continue;
    }
    if (c.budgetLeftCents !== null && one.goodsCents + one.deliveryCents > c.budgetLeftCents) {
      refused.push({ promotionId: c.id, reason: "over_budget" });
      continue;
    }
    alone.set(c.id, ev);
    live.push(c);
  }
  if (live.length === 0) return { ...EMPTY, notApplied: refused };

  // The options: every combinable one together, or each non-combinable one on its own.
  const options: Candidate[][] = [];
  const together = live.filter((c) => c.combinable);
  if (together.length > 0) options.push(together);
  for (const c of live) if (!c.combinable) options.push([c]);

  let best: { members: Candidate[]; ev: Evaluation } | null = null;
  for (const members of options) {
    const ev = members.length === 1 ? alone.get(members[0]!.id)! : evaluate(basket, members);
    if (!best || better({ members, ev }, best)) best = { members, ev };
  }
  const winner = best!;

  const appliedIds = new Set(winner.ev.applied.map((a) => a.promotionId));
  const notApplied = [
    ...refused,
    ...winner.ev.refused,
    ...live.filter((c) => !appliedIds.has(c.id) && !winner.ev.refused.some((r) => r.promotionId === c.id)).map(
      (c): NotApplied => ({ promotionId: c.id, reason: "not_combined" }),
    ),
  ];
  return {
    applied: winner.ev.applied,
    lineDiscounts: winner.ev.lineDiscounts,
    goodsDiscountCents: winner.ev.goodsCents,
    deliveryDiscountCents: winner.ev.deliveryCents,
    notApplied,
  };
}

interface Evaluation {
  applied: AppliedPromotion[];
  refused: NotApplied[];
  lineDiscounts: Record<string, number>;
  goodsCents: number;
  deliveryCents: number;
}

/** A rule the basket's contents cannot change: when, and which delivery. */
function gateOf(c: Candidate, basket: Basket, ctx: EngineContext): NotAppliedReason | null {
  if (c.daysOfWeek && !c.daysOfWeek.includes(ctx.isoDay)) return "wrong_time";
  if (c.minuteFrom !== null && c.minuteTo !== null && (ctx.minuteOfDay < c.minuteFrom || ctx.minuteOfDay >= c.minuteTo)) {
    return "wrong_time";
  }
  if (basket.deliveryType && !c.deliveryTypes.includes(basket.deliveryType)) return "wrong_delivery";
  return null;
}

function better(a: { members: Candidate[]; ev: Evaluation }, b: { members: Candidate[]; ev: Evaluation }): boolean {
  const ta = a.ev.goodsCents + a.ev.deliveryCents;
  const tb = b.ev.goodsCents + b.ev.deliveryCents;
  if (ta !== tb) return ta > tb;
  const ea = soonestEnd(a.members);
  const eb = soonestEnd(b.members);
  if (ea !== eb) return ea < eb;
  return oldest(a.members) < oldest(b.members);
}

const soonestEnd = (cs: Candidate[]) => Math.min(...cs.map((c) => (c.endsAt ? c.endsAt.getTime() : Number.MAX_SAFE_INTEGER)));
const oldest = (cs: Candidate[]) => Math.min(...cs.map((c) => c.createdAt.getTime()));

const STAGE: Record<EngineKind, number> = { item: 0, bxgy: 1, cart: 2, delivery: 3 };

/** Applies a set of candidates in order and records what each took. */
function evaluate(basket: Basket, members: readonly Candidate[]): Evaluation {
  const remaining = new Map(basket.lines.map((l) => [l.lineId, l.unitCents * l.quantity]));
  const ordered = [...members].sort((a, b) => STAGE[a.kind] - STAGE[b.kind] || a.createdAt.getTime() - b.createdAt.getTime());
  const applied: AppliedPromotion[] = [];
  const refused: NotApplied[] = [];
  let fee = basket.deliveryFeeCents;

  for (const c of ordered) {
    if (c.kind === "delivery") {
      const goods = sum([...remaining.values()]);
      if (goods < c.minSubtotalCents) {
        refused.push({ promotionId: c.id, reason: "below_minimum", shortfallCents: c.minSubtotalCents - goods });
        continue;
      }
      if (fee === null) {
        applied.push({ promotionId: c.id, codeId: c.codeId, codeText: c.codeText, kind: c.kind, goodsCents: 0, deliveryCents: 0, lines: [], awaitingDeliveryFee: true });
        continue;
      }
      const off = cap(c, valueOff(c, fee, 1));
      fee -= off;
      applied.push({ promotionId: c.id, codeId: c.codeId, codeText: c.codeText, kind: c.kind, goodsCents: 0, deliveryCents: off, lines: [], awaitingDeliveryFee: false });
      continue;
    }

    const lines = c.kind === "cart" ? basket.lines : basket.lines.filter((l) => covers(c, l));
    const units = sum(lines.map((l) => l.quantity));
    const base = sum(lines.map((l) => remaining.get(l.lineId)!));
    if (c.minQuantity !== null && units < c.minQuantity) {
      refused.push({ promotionId: c.id, reason: "below_quantity", missingQuantity: c.minQuantity - units });
      continue;
    }
    if (base < c.minSubtotalCents) {
      refused.push({ promotionId: c.id, reason: "below_minimum", shortfallCents: c.minSubtotalCents - base });
      continue;
    }

    let perLine: Map<string, number>;
    if (c.kind === "cart") {
      const total = cap(c, valueOff(c, base, 1));
      perLine = allocate(total, lines.map((l) => [l.lineId, remaining.get(l.lineId)!]));
    } else if (c.kind === "item") {
      perLine = new Map(lines.map((l) => [l.lineId, valueOff(c, remaining.get(l.lineId)!, l.quantity)]));
      const total = sum([...perLine.values()]);
      const capped = cap(c, total);
      if (capped < total) perLine = allocate(capped, lines.map((l) => [l.lineId, remaining.get(l.lineId)!]));
    } else {
      perLine = buyXGetY(c, lines, remaining);
      if (sum([...perLine.values()]) === 0 && c.bxgy) {
        const need = c.bxgy.buy + c.bxgy.get;
        refused.push({ promotionId: c.id, reason: "below_quantity", missingQuantity: Math.max(1, need - units) });
        continue;
      }
    }

    const touched: { lineId: string; cents: number }[] = [];
    for (const [lineId, cents] of perLine) {
      const left = remaining.get(lineId)!;
      const take = Math.min(left, Math.max(0, cents));
      if (take <= 0) continue;
      remaining.set(lineId, left - take);
      touched.push({ lineId, cents: take });
    }
    applied.push({
      promotionId: c.id,
      codeId: c.codeId,
      codeText: c.codeText,
      kind: c.kind,
      goodsCents: sum(touched.map((t) => t.cents)),
      deliveryCents: 0,
      lines: touched,
      awaitingDeliveryFee: false,
    });
  }

  const lineDiscounts: Record<string, number> = {};
  for (const l of basket.lines) {
    const lost = l.unitCents * l.quantity - remaining.get(l.lineId)!;
    if (lost > 0) lineDiscounts[l.lineId] = lost;
  }
  return {
    applied: applied.filter((a) => a.goodsCents + a.deliveryCents > 0 || a.awaitingDeliveryFee),
    refused,
    lineDiscounts,
    goodsCents: sum(Object.values(lineDiscounts)),
    deliveryCents: sum(applied.map((a) => a.deliveryCents)),
  };
}

function covers(c: Candidate, l: BasketLine): boolean {
  switch (c.appliesTo) {
    case "cart":
      return true;
    case "products":
      return c.targets.productIds.has(l.productId);
    case "categories":
      return l.categoryIds.some((id) => c.targets.categoryIds.has(id));
    case "brands":
      return l.brand !== null && c.targets.brands.has(l.brand);
  }
}

/** What the promotion's value takes off `base` cents covering `units` units (amount is per unit). */
function valueOff(c: Candidate, base: number, units: number): number {
  if (base <= 0) return 0;
  switch (c.valueType) {
    case "free":
      return base;
    case "percent":
      return Math.floor((base * (c.percentOff ?? 0)) / 100);
    case "amount":
      return Math.min(base, (c.amountOffCents ?? 0) * units);
  }
}

function cap(c: Candidate, cents: number): number {
  return c.maxDiscountCents !== null ? Math.min(cents, c.maxDiscountCents) : cents;
}

/** Buy X get Y: units dearest first in groups of buy + get, the cheapest `get` of each reduced. */
function buyXGetY(c: Candidate, lines: readonly BasketLine[], remaining: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  if (!c.bxgy) return out;
  const units: { lineId: string; cents: number }[] = [];
  for (const l of lines) {
    const left = remaining.get(l.lineId)!;
    const each = Math.floor(left / l.quantity);
    for (let i = 0; i < l.quantity; i++) units.push({ lineId: l.lineId, cents: i === l.quantity - 1 ? left - each * (l.quantity - 1) : each });
  }
  units.sort((a, b) => b.cents - a.cents);
  const size = c.bxgy.buy + c.bxgy.get;
  let groups = Math.floor(units.length / size);
  if (c.bxgy.maxPerOrder !== null) groups = Math.min(groups, c.bxgy.maxPerOrder);
  for (let g = 0; g < groups; g++) {
    const group = units.slice(g * size, (g + 1) * size);
    for (const u of group.slice(c.bxgy.buy)) {
      const off = c.valueType === "percent" ? Math.floor((u.cents * (c.percentOff ?? 0)) / 100) : u.cents;
      out.set(u.lineId, (out.get(u.lineId) ?? 0) + off);
    }
  }
  return out;
}

/** Split `total` cents across lines in proportion to their weight, largest remainder first. */
export function allocate(total: number, weights: readonly (readonly [string, number])[]): Map<string, number> {
  const out = new Map<string, number>();
  const whole = sum(weights.map(([, w]) => w));
  if (total <= 0 || whole <= 0) return out;
  const amount = Math.min(total, whole);
  const shares = weights.map(([id, w]) => {
    const exact = (amount * w) / whole;
    return { id, floor: Math.floor(exact), rest: exact - Math.floor(exact), w };
  });
  let left = amount - sum(shares.map((s) => s.floor));
  // Largest remainder; ties to the larger line, then the earlier one (stable).
  const order = [...shares].sort((a, b) => b.rest - a.rest || b.w - a.w);
  for (const s of order) {
    if (left <= 0) break;
    if (s.floor < s.w) {
      s.floor += 1;
      left -= 1;
    }
  }
  for (const s of shares) if (s.floor > 0) out.set(s.id, s.floor);
  return out;
}

function sum(xs: readonly number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t;
}

/** Melbourne's ISO day and minute of day for an instant — the context the engine is given. */
export function melbourneContext(at: Date): EngineContext {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const days: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { isoDay: days[get("weekday")] ?? 1, minuteOfDay: Number(get("hour")) * 60 + Number(get("minute")) };
}
