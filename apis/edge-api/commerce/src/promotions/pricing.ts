import { formatCents, type Queryable } from "@effy/edge-shared";
import {
  basketLinesFor,
  candidatesFor,
  codeById,
  type CodeRefusal,
  codeRefusal,
  codeRefusalSentence,
  findCode,
  melbourneContext,
  notAppliedSentence,
  offerLabelOf,
  pricePromotions,
  type PromotionOutcome,
  type PromotionRecord,
  shopperFacts,
  loadPromotions,
} from "@effy/edge-shared/promotions";
import type { CartDiscountDTO, CartNotAppliedDTO, CartPromotionLineDTO } from "@effy/shared-types";

/**
 * Commerce's one way into the promotion engine (094). The cart read, applying a code and the payment
 * intent all price through `pricePromotionsFor`, so the cart, the charge and the receipt agree (SC-003).
 *
 * A basket line's id is its VARIANT id (098) — the cart has one line per variant, and the order's lines
 * are written from the same cart — so a line's discount is carried from the price to the order by
 * variant. Targets stay product, category and brand: a promotion on a product covers all its variants,
 * and a minimum quantity counts units across them (the engine sums the lines it covers).
 */

export interface PricingLine {
  /** 098 — the line's id. */
  variantId: string;
  /** What promotions target. */
  productId: string;
  unitCents: number;
  quantity: number;
}

export interface PricingInput {
  customerId: string | null;
  enteredCodeId: string | null;
  lines: readonly PricingLine[];
  deliveryType: "effy" | "courier" | null;
  deliveryFeeCents: number | null;
  now: Date;
  /** The pending order being re-priced: its own held uses do not count against it. */
  excludeOrderId?: string | null;
}

export interface Pricing {
  outcome: PromotionOutcome;
  records: Map<string, PromotionRecord>;
  enteredRefusal: CodeRefusal | null;
  enteredPromotionId: string | null;
  singleUseCodeIds: Set<string>;
  /** Price the same basket again for another delivery type and fee (a quote's options) — no reads. */
  reprice?: (deliveryType: "effy" | "courier", deliveryFeeCents: number) => PromotionOutcome;
}

export class PromotionCodeRefusedError extends Error {
  constructor(readonly reason: CodeRefusal, readonly detail: string) {
    super(reason);
    this.name = "PromotionCodeRefusedError";
  }
}

export async function pricePromotionsFor(db: Queryable, input: PricingInput): Promise<Pricing> {
  const [set, basketLines] = await Promise.all([
    candidatesFor(db, { customerId: input.customerId, enteredCodeId: input.enteredCodeId, now: input.now, excludeOrderId: input.excludeOrderId ?? null }),
    basketLinesFor(db, input.lines.map((l) => ({ lineId: l.variantId, productId: l.productId, unitCents: l.unitCents, quantity: l.quantity }))),
  ]);
  const outcome = pricePromotions(
    { lines: basketLines, deliveryType: input.deliveryType, deliveryFeeCents: input.deliveryFeeCents },
    set.candidates,
    melbourneContext(input.now),
  );
  const entered = set.candidates.find((c) => c.codeId !== null);
  const singleUse = new Set<string>();
  if (input.enteredCodeId && (await codeById(db, input.enteredCodeId))?.singleUse) singleUse.add(input.enteredCodeId);
  const reprice = (deliveryType: "effy" | "courier", deliveryFeeCents: number) =>
    pricePromotions({ lines: basketLines, deliveryType, deliveryFeeCents }, set.candidates, melbourneContext(input.now));
  return {
    reprice,
    outcome,
    records: set.records,
    enteredRefusal: set.enteredRefusal,
    enteredPromotionId: entered?.id ?? null,
    singleUseCodeIds: singleUse,
  };
}

/**
 * Whether a typed code may be put on the cart. A code the shopper cannot use is REFUSED with its reason
 * (027's rule, kept): unknown, not started, ended, used up, not for this account, already used, or the
 * cart is below its minimum. A code that is valid but loses to a better offer, or applies at another
 * time, IS stored — the cart says why it is not applying.
 */
export async function vetCode(db: Queryable, input: { customerId: string; raw: string; lines: readonly PricingLine[]; now: Date }): Promise<string> {
  const found = await findCode(db, input.raw, input.now);
  if (!found) throw new PromotionCodeRefusedError("promo_unknown", codeRefusalSentence("promo_unknown"));
  const [rec] = await loadPromotions(db, { ids: [found.promotionId] }, input.now);
  const facts = await shopperFacts(db, input.customerId, input.now);
  const refusal = codeRefusal(rec, found, facts);
  if (refusal) throw new PromotionCodeRefusedError(refusal, codeRefusalSentence(refusal, rec?.words));

  const priced = await pricePromotionsFor(db, {
    customerId: input.customerId, enteredCodeId: found.codeId, lines: input.lines, deliveryType: null, deliveryFeeCents: null, now: input.now,
  });
  const miss = priced.outcome.notApplied.find((n) => n.promotionId === found.promotionId);
  if (miss?.reason === "below_minimum" || miss?.reason === "below_quantity") {
    const reason: CodeRefusal = "promo_below_minimum";
    const detail =
      miss.reason === "below_quantity"
        ? notAppliedSentence("below_quantity", rec!.words, { missingQuantity: miss.missingQuantity })
        : codeRefusalSentence(reason, rec!.words, { shortfallCents: miss.shortfallCents });
    throw new PromotionCodeRefusedError(reason, detail);
  }
  if (miss?.reason === "over_budget") throw new PromotionCodeRefusedError("promo_out_of_budget", codeRefusalSentence("promo_out_of_budget"));
  return found.codeId;
}

/** 094 — what the cart needs from promotions. A port, so the cart's unit tests can stand one in. */
export interface PromotionPort {
  price(input: PricingInput): Promise<Pricing>;
  vet(input: { customerId: string; raw: string; lines: readonly PricingLine[]; now: Date }): Promise<string>;
}

export const promotionPort = (db: Queryable): PromotionPort => ({
  price: (input) => pricePromotionsFor(db, input),
  vet: (input) => vetCode(db, input),
});

const headlineOf = (rec: PromotionRecord | undefined): string => (rec ? rec.headline ?? offerLabelOf(rec.words) : "Promotion");

/** The cart's promotion lines, its kept single `discount` (installed apps) and its not-applied sentences. */
export function cartPromotionView(p: Pricing): {
  promotions: CartPromotionLineDTO[];
  notApplied: CartNotAppliedDTO[];
  discount: CartDiscountDTO | null;
  enteredLapsed: string | null;
} {
  const promotions = p.outcome.applied.map((a) => ({
    promotionId: a.promotionId,
    headline: headlineOf(p.records.get(a.promotionId)),
    code: a.codeText,
    goodsAmount: formatCents(a.goodsCents),
    deliveryAmount: formatCents(a.deliveryCents),
  }));

  const notApplied: CartNotAppliedDTO[] = [];
  for (const n of p.outcome.notApplied) {
    const rec = p.records.get(n.promotionId);
    if (!rec) continue;
    const isEntered = n.promotionId === p.enteredPromotionId;
    // An automatic offer that is out of reach only by time or delivery is noise in the cart.
    if (!isEntered && (n.reason === "wrong_time" || n.reason === "wrong_delivery")) continue;
    if (n.reason === "nothing_to_discount" || n.reason === "over_budget") continue;
    const instead = n.reason === "not_combined" ? (promotions[0]?.code ?? promotions[0]?.headline ?? null) : null;
    notApplied.push({
      promotionId: n.promotionId,
      headline: headlineOf(rec),
      reason: n.reason,
      detail: notAppliedSentence(n.reason, rec.words, { shortfallCents: n.shortfallCents, missingQuantity: n.missingQuantity, appliedInstead: instead }),
    });
  }

  const enteredApplied = p.outcome.applied.find((a) => a.codeId !== null);
  const enteredRec = enteredApplied ? p.records.get(enteredApplied.promotionId) : undefined;
  const discount: CartDiscountDTO | null =
    enteredApplied && enteredRec
      ? {
          code: enteredApplied.codeText ?? "",
          kind: enteredRec.words.valueType === "percent" ? "percentage" : "fixed",
          amount: formatCents(enteredApplied.goodsCents),
          label: offerLabelOf(enteredRec.words),
        }
      : null;

  let enteredLapsed: string | null = null;
  if (p.enteredRefusal) enteredLapsed = codeRefusalSentence(p.enteredRefusal);
  else if (p.enteredPromotionId && !enteredApplied) {
    enteredLapsed = notApplied.find((n) => n.promotionId === p.enteredPromotionId)?.detail ?? "Your code no longer applies to this cart.";
  }
  return { promotions, notApplied, discount, enteredLapsed };
}
