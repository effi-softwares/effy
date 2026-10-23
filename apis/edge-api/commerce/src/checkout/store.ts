// What the charge is computed from and the pending order it is recorded against. Payment
// finalisation lives in `@effy/edge-shared/payments`.
import {
  formatCents, parseCents, pooled, variantPurchasableSql, withTransaction, type Queryable, type Transactor,
} from "@effy/edge-shared";
import { variantLabelSql } from "@effy/edge-shared/catalog";
import {
  judgeWindow, loadSlotSettings, lockSlot, collectionSchedule, slotLoad, type SlotVerdict,
} from "@effy/edge-shared/delivery";
import type { PaymentMethodSummary } from "@effy/edge-shared/payments";
import { holdUses } from "@effy/edge-shared/promotions";
import type { DeliveryPromise } from "@effy/shared-types";
import { hold as holdLedgerPoints, loadSettings as loadPointsSettings, usable as usablePoints } from "@effy/edge-shared/points";
import { randomBytes } from "node:crypto";

import type { Pricing } from "../promotions/pricing";

export interface CheckoutLine {
  productId: string;
  variantId: string;
  /** Its current label, snapshotted onto the order line; null with no options. */
  variantLabel: string | null;
  /** Snapshotted for the picker. */
  sku: string | null;
  gtin: string | null;
  shopId: string;
  name: string;
  unitCents: number;
  /** What will be charged, already capped at stock. */
  quantity: number;
  /** What the cart asked for, before the cap. */
  requestedQuantity: number;
  /** The variant's per-unit weight. */
  weightGrams: number;
  /** frozen | chilled | ambient, snapshotted so a driver is told what was sold. */
  storageClass: string;
  /** What the shop is owed per unit. */
  shopUnitCents: number;
  /** False for a product with no GST class. */
  gstClassified?: boolean;
}

export interface PackageDelivery {
  shopId: string;
  method: string;
  /** yyyy-mm-dd, Melbourne. */
  promisedDay: string;
  slotId: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
}

export interface SoldDelivery {
  type: "effy" | "courier";
  reason: "in_coverage" | "out_of_coverage" | "no_window";
  /** The courier timeframe as shown; null unless a courier delivers. */
  courierEstimate: string | null;
  /** The default courier service behind that timeframe. */
  courierServiceId?: string | null;
  /** How the parcels reach the courier. */
  courierCollection?: "hub" | "supplier" | null;
  /** Null for a courier order. */
  promise?: DeliveryPromise | null;
  /** Set exactly when `promise` is `asap`. */
  asapEstimate?: string | null;
}

export interface SlotHold {
  slotId: string;
  /** yyyy-mm-dd (Melbourne). */
  date: string;
  now: Date;
}

/** Nothing was written. */
export class SlotUnavailableError extends Error {
  constructor(readonly verdict: Exclude<SlotVerdict, "open">) {
    super(`checkout: delivery slot unavailable (${verdict})`);
  }
}

export interface OrderAmounts {
  itemSubtotalCents: number;
  /** One fee for the order, small-order fee included. */
  deliveryFeeCents: number;
  /** Stored with the amount and never recomputed, so the receipt explains itself after plan changes. */
  deliveryFeeBreakdown: unknown;
  discountCents: number;
  /** Denormalised so the receipt can still name it. */
  promoCode: string | null;
  grandTotalCents: number;
  currency: string;
  /** Points do not reduce grandTotalCents; 0 when none. */
  pointsUsed: number;
  /** Snapshotted; null when no points are used. */
  pointsCentsPerPoint: number | null;
  pointsValueCents: number;
}

export interface PaymentProfile {
  providerCustomerId: string | null;
  email: string;
  name: string;
}

interface LineRow {
  product_id: string;
  variant_id: string;
  variant_label: string | null;
  sku: string | null;
  gtin: string | null;
  shop_id: string;
  name: string;
  unit_price_amount: string;
  shop_unit_price_amount: string;
  quantity: number;
  requested_quantity: number;
  weight_grams: number;
  storage_class: string;
  gst_classified: boolean;
}

const storageClassOrAmbient = (c: string) => (c === "frozen" || c === "chilled" ? c : "ambient");

/** `EFY-` + six characters with no look-alikes (no I, L, O, U). */
export function generateOrderNumber(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  return `EFY-${[...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join("")}`;
}

export interface CheckoutStore {
  cartLines(customerId: string): Promise<CheckoutLine[]>;
  /** False while tax details are unset. */
  invoicesEnabled(): Promise<boolean>;
  addressSnapshot(customerId: string, addressId: string): Promise<Record<string, unknown> | null>;
  paymentProfile(customerId: string): Promise<PaymentProfile>;
  setProviderCustomerId(customerId: string, providerCustomerId: string): Promise<void>;
  upsertPendingOrder(
    customerId: string, amounts: OrderAmounts, address: Record<string, unknown>, lines: readonly CheckoutLine[], reusePending: boolean,
  ): Promise<{ orderId: string; orderNumber: string }>;
  setOrderBilling(orderId: string, billing: Record<string, unknown> | null): Promise<void>;
  setOrderDeliveryInstructions(orderId: string, handover: string | null, note: string | null): Promise<void>;
  captureDelivery(orderId: string, pkgs: readonly PackageDelivery[], hold: SlotHold | null, sold: SoldDelivery | null): Promise<Date | null>;
  upsertPayment(orderId: string, intentId: string, amountCents: number, status: string): Promise<void>;
  pointsFor(customerId: string, now: Date): Promise<{ usable: number; centsPerPoint: number }>;
  /** 0 releases any earlier hold. Throws InsufficientPointsError. */
  holdPoints(orderId: string, customerId: string, points: number, now: Date): Promise<void>;
  /** A points-only order's payment row: provider `points`, nothing charged. */
  placePointsOnly(orderId: string): Promise<void>;
  orderIntentForCustomer(customerId: string, orderId: string): Promise<string | null>;
  pendingOrderIntent(customerId: string): Promise<{ orderId: string; intentId: string } | null>;
  /** Writes the promotion records and holds their uses in one transaction; throws `PromotionsChangedError`. */
  recordPromotions(orderId: string, customerId: string, priced: Pricing, now: Date): Promise<void>;
  savePaymentMethod(orderId: string, m: PaymentMethodSummary): Promise<void>;
}

/** Takes the caller's connection: the webhook runs it in a transaction. */
export async function findOrderByIntent(q: Queryable, intentId: string): Promise<string | null> {
  return (
    (await q.query<{ order_id: string }>(`SELECT order_id::text AS order_id FROM public.payment WHERE stripe_payment_intent_id = $1`, [intentId]))
      .rows[0]?.order_id ?? null
  );
}

export function createCheckoutStore(db: Queryable = pooled, transact: Transactor = withTransaction): CheckoutStore {
  return {
    /** Payable lines, already capped at stock. */
    async invoicesEnabled() {
      const r = await db.query<{ on: boolean }>(`SELECT invoices_enabled AS on FROM public.business_tax LIMIT 1`);
      return r.rows[0]?.on === true;
    },

    async cartLines(customerId) {
      const rows = (
        await db.query<LineRow>(
          `
SELECT ci.product_id::text AS product_id,
       ci.variant_id::text AS variant_id,
       ${variantLabelSql("v")} AS variant_label,
       v.sku               AS sku,
       v.gtin              AS gtin,
       p.shop_id::text     AS shop_id,
       p.name              AS name,
       -- The VARIANT's prices. price_amount is what the CUSTOMER pays and is what is charged
       -- ; the shop's own price rides beside it.
       v.price_amount::text AS unit_price_amount,
       v.shop_price_amount::text AS shop_unit_price_amount,
       -- ⚠ the quantity PAID FOR is capped at what the shop can supply. Without this a
       -- line asking for 5 with 2 on the shelf would create a charge for 5, and the shopper would
       -- pay in full for three units that do not exist.
       -- ⚠ In SQL, not in code, so it cannot be forgotten by a second caller of this read.
       LEAST(ci.quantity,
             CASE WHEN v.stock_tracked THEN v.stock_on_hand ELSE ci.quantity END) AS quantity,
       ci.quantity         AS requested_quantity,
       v.weight_grams      AS weight_grams,
       -- ⚠ storage is a product ATTRIBUTE, not a column. Anything that is not exactly frozen
       -- or chilled is ambient, INCLUDING a value the back office adds later: the order line's
       -- CHECK admits three values, and an unrecognised fourth must not fail a shopper's payment.
       COALESCE((
           SELECT CASE WHEN pav.value_text IN ('frozen', 'chilled') THEN pav.value_text END
             FROM public.product_attribute_value pav
             JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
            WHERE pav.product_id = p.id AND ad.key = 'storage'
            LIMIT 1), 'ambient') AS storage_class,
       p.gst_status IS NOT NULL AS gst_classified
FROM public.cart c
JOIN public.cart_item ci ON ci.cart_id = c.id
JOIN public.product p ON p.id = ci.product_id
JOIN public.product_variant v ON v.id = ci.variant_id
WHERE c.customer_id = $1 AND ${variantPurchasableSql("p", "v")}
ORDER BY ci.added_at ASC`,
          [customerId],
        )
      ).rows;
      return rows.map((r) => ({
        productId: r.product_id, variantId: r.variant_id, variantLabel: r.variant_label, sku: r.sku, gtin: r.gtin,
        shopId: r.shop_id, name: r.name,
        unitCents: parseCents(r.unit_price_amount), shopUnitCents: parseCents(r.shop_unit_price_amount),
        quantity: r.quantity, requestedQuantity: r.requested_quantity,
        weightGrams: r.weight_grams, storageClass: r.storage_class, gstClassified: r.gst_classified,
      }));
    },

    /** Scoped to its owner; null if absent. */
    async addressSnapshot(customerId, addressId) {
      return (
        (
          await db.query<{ snap: Record<string, unknown> }>(
            `
SELECT jsonb_build_object(
    'recipientName', recipient_name, 'phone', phone, 'line1', line1, 'line2', line2,
    'city', city, 'region', region, 'postalCode', postal_code, 'country', country
) AS snap
FROM public.customer_address WHERE id = $1 AND customer_id = $2`,
            [addressId, customerId],
          )
        ).rows[0]?.snap ?? null
      );
    },

    /** Email and name come from the platform record, never a token or request: the provider prints them. */
    async paymentProfile(customerId) {
      const row = (
        await db.query<{ provider: string; email: string; name: string }>(
          `
SELECT COALESCE(stripe_customer_id, '') AS provider,
       COALESCE(email::text, '') AS email,
       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', given_name, family_name)), ''), '') AS name
FROM public.customer WHERE id = $1`,
          [customerId],
        )
      ).rows[0];
      return { providerCustomerId: row?.provider ? row.provider : null, email: row?.email ?? "", name: row?.name ?? "" };
    },

    /** First-wins: a retried intent cannot overwrite the reference. */
    async setProviderCustomerId(customerId, providerCustomerId) {
      await db.query(
        `UPDATE public.customer SET stripe_customer_id = $2, updated_at = now()
		 WHERE id = $1 AND stripe_customer_id IS NULL`,
        [customerId, providerCustomerId],
      );
    },

    /**
     * Locates or creates the pending order and replaces its lines: the snapshot that fixes the charge.
     * Whether to reuse an existing pending order is the service's call (only the provider knows).
     */
    upsertPendingOrder: (customerId, a, address, lines, reusePending) =>
      transact(async (tx) => {
        let existing: { id: string; order_number: string } | undefined;
        if (reusePending) {
          // A customer can hold several pending orders, hence the order by; for UPDATE serialises two
          // concurrent checkouts so one basket does not overwrite another.
          existing = (
            await tx.query<{ id: string; order_number: string }>(
              `
SELECT id::text AS id, order_number FROM public."order"
WHERE customer_id = $1 AND status = 'pending_payment'
ORDER BY created_at DESC
LIMIT 1
FOR UPDATE`,
              [customerId],
            )
          ).rows[0];
        }

        let orderId: string;
        let orderNumber: string;
        if (!existing) {
          orderNumber = generateOrderNumber();
          orderId = (
            await tx.query<{ id: string }>(
              `
INSERT INTO public."order"
    (customer_id, order_number, status, currency, item_subtotal_amount,
     discount_amount, promo_code, grand_total_amount, delivery_address, delivery_fee_amount,
     points_used, points_cents_per_point, points_value_amount, delivery_fee_breakdown)
VALUES ($1, $2, 'pending_payment', $3, $4::numeric,
        $7::numeric, $8, $5::numeric, $6::jsonb, $9::numeric,
        $10, $11, $12::numeric, $13::jsonb)
RETURNING id::text AS id`,
              [
                customerId, orderNumber, a.currency, formatCents(a.itemSubtotalCents), formatCents(a.grandTotalCents),
                JSON.stringify(address), formatCents(a.discountCents), a.promoCode, formatCents(a.deliveryFeeCents),
                a.pointsUsed, a.pointsCentsPerPoint, formatCents(a.pointsValueCents), JSON.stringify(a.deliveryFeeBreakdown),
              ],
            )
          ).rows[0]!.id;
        } else {
          orderId = existing.id;
          orderNumber = existing.order_number;
          await tx.query(
            `
UPDATE public."order" SET item_subtotal_amount=$2::numeric,
    grand_total_amount=$3::numeric, delivery_address=$4::jsonb,
    discount_amount=$5::numeric, promo_code=$6,
    delivery_fee_amount=$7::numeric,
    points_used=$8, points_cents_per_point=$9, points_value_amount=$10::numeric,
    delivery_fee_breakdown=$11::jsonb,
    updated_at=now() WHERE id=$1`,
            [
              orderId, formatCents(a.itemSubtotalCents), formatCents(a.grandTotalCents), JSON.stringify(address),
              formatCents(a.discountCents), a.promoCode, formatCents(a.deliveryFeeCents),
              a.pointsUsed, a.pointsCentsPerPoint, formatCents(a.pointsValueCents), JSON.stringify(a.deliveryFeeBreakdown),
            ],
          );
          await tx.query(`DELETE FROM public.order_item WHERE order_id = $1`, [orderId]);
        }

        for (const l of lines) {
          // Both prices are fixed at placement: what the customer is charged and what the shop is owed.
          await tx.query(
            `
INSERT INTO public.order_item
    (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount,
     storage_class, shop_unit_price_amount, shop_line_subtotal_amount, gst_status,
     variant_id, variant_label, sku, gtin, variant_code)
VALUES ($1, $2, $3, $4, $5::numeric, $6, $7::numeric, $8, $9::numeric, $10::numeric,
        -- The product's GST status as it is NOW, frozen on the line: a later change to the
        -- product never alters what this order's tax invoice says.
        (SELECT p.gst_status FROM public.product p WHERE p.id = $2),
        -- The variant, and its label and codes AS SOLD (snapshots, like the name and price).
        $11, $12, $13, $14,
        -- Effy's code for the variant (never changes, but kept beside its siblings).
        (SELECT v.code FROM public.product_variant v WHERE v.id = $11))`,
            [
              orderId, l.productId, l.shopId, l.name, formatCents(l.unitCents), l.quantity, formatCents(l.unitCents * l.quantity),
              storageClassOrAmbient(l.storageClass), formatCents(l.shopUnitCents), formatCents(l.shopUnitCents * l.quantity),
              l.variantId, l.variantLabel, l.sku, l.gtin,
            ],
          );
        }
        return { orderId, orderNumber };
      }),

    /** null means billing is the same as shipping. */
    async setOrderBilling(orderId, billing) {
      await db.query(`UPDATE public."order" SET billing_address = $2::jsonb, updated_at = now() WHERE id = $1`, [
        orderId,
        billing === null ? null : JSON.stringify(billing),
      ]);
    },

    /** Only a pending order is written: once paid, the instructions cannot change. */
    async setOrderDeliveryInstructions(orderId, handover, note) {
      await db.query(
        `UPDATE public."order" SET delivery_handover = $2, delivery_note = $3, updated_at = now()
		  WHERE id = $1 AND status = 'pending_payment'`,
        [orderId, handover, note],
      );
    },

    /**
     * The last moment the server can refuse before money moves (the client confirms payment directly).
     * A refusal rolls back and leaves any previously held place as it was.
     */
    captureDelivery: (orderId, pkgs, hold, sold) =>
      transact(async (tx) => {
        // The order's own place is released first, so it does not count against itself.
        await tx.query(`DELETE FROM public.delivery_slot_booking WHERE order_id = $1`, [orderId]);

        let heldUntil: Date | null = null;
        if (hold) {
          // The slot's row lock is the capacity guarantee.
          const slot = await lockSlot(tx, hold.slotId);
          if (!slot) throw new SlotUnavailableError("cutoff");
          const { runs, bufferMin } = await collectionSchedule(tx);
          const settings = await loadSlotSettings(tx);
          // The same rule the quote offered it by, judged for that day.
          const load = await slotLoad(tx, hold.date);
          const judged = judgeWindow(hold.now, hold.date, slot, load.get(slot.id) ?? 0, runs, bufferMin, settings.turnaroundMin);
          if (judged.verdict !== "open") throw new SlotUnavailableError(judged.verdict);

          heldUntil = new Date(hold.now.getTime() + settings.holdMin * 60_000);
          await tx.query(
            `
INSERT INTO public.delivery_slot_booking
    (slot_id, delivery_date, order_id, state, held_until, window_start, window_end)
VALUES ($1, $2::date, $3, 'held', $4, $5, $6)`,
            [slot.id, judged.slot.date, orderId, heldUntil, judged.slot.start, judged.slot.end],
          );
        }

        await tx.query(
          `
UPDATE public."order"
   -- Rewritten on every payment attempt (the address, and with it the answer, may have changed). Once
   -- paid, only the delivery-type writer changes them.
   SET delivery_type = $2, delivery_type_reason = $3, courier_estimate = $4,
       courier_service_id = $5::uuid, courier_collection = $6,
       delivery_promise = $7, asap_estimate = $8,
       updated_at = now()
WHERE id = $1`,
          [orderId, sold?.type ?? null, sold?.reason ?? null, sold?.courierEstimate ?? null,
           sold?.courierServiceId ?? null, sold?.courierCollection ?? null,
           sold?.type === "effy" ? (sold.promise ?? "window") : null, sold?.promise === "asap" ? (sold.asapEstimate ?? null) : null],
        );
        await tx.query(`DELETE FROM public.order_package_delivery WHERE order_id = $1`, [orderId]);
        for (const p of pkgs) {
          await tx.query(
            `
INSERT INTO public.order_package_delivery
    (order_id, shop_id, method, promised_from, promised_to,
     slot_id, window_start, window_end)
VALUES ($1, $2, $3, NULLIF($4, '')::date, NULLIF($4, '')::date,
        $5::uuid, $6, $7)`,
            // No fee: delivery is priced once per order.
            [orderId, p.shopId, p.method, p.promisedDay, p.slotId, p.windowStart, p.windowEnd],
          );
        }
        return heldUntil;
      }),

    async upsertPayment(orderId, intentId, amountCents, status) {
      await db.query(
        `
INSERT INTO public.payment (order_id, provider, stripe_payment_intent_id, amount, currency, status)
VALUES ($1, 'stripe', $2, $3::numeric, 'AUD', $4)
ON CONFLICT (order_id) DO UPDATE SET stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
    amount = EXCLUDED.amount, status = EXCLUDED.status, updated_at = now()`,
        [orderId, intentId, formatCents(amountCents), status],
      );
    },

    async pointsFor(customerId, now) {
      const [u, settings] = await Promise.all([usablePoints(db, customerId, now), loadPointsSettings(db)]);
      return { usable: Math.max(0, u), centsPerPoint: settings.centsPerPoint };
    },

    holdPoints: (orderId, customerId, points, now) =>
      transact(async (tx) => {
        await holdLedgerPoints(tx, { customerId, orderId, points, now });
      }),

    /** No intent and nothing charged; the row gives refunds a payment record to find. */
    async placePointsOnly(orderId) {
      await db.query(
        `
INSERT INTO public.payment (order_id, provider, stripe_payment_intent_id, amount, currency, status)
VALUES ($1, 'points', NULL, 0, 'AUD', 'requires_payment')
ON CONFLICT (order_id) DO UPDATE SET provider = 'points', stripe_payment_intent_id = NULL, amount = 0,
    status = 'requires_payment', updated_at = now()`,
        [orderId],
      );
    },

    /** Scoped to the owner; null for another shopper's order. */
    async orderIntentForCustomer(customerId, orderId) {
      return (
        (
          await db.query<{ intent: string }>(
            `
SELECT pay.stripe_payment_intent_id AS intent
FROM public."order" o JOIN public.payment pay ON pay.order_id = o.id
WHERE o.id = $1 AND o.customer_id = $2 AND pay.stripe_payment_intent_id IS NOT NULL`,
            [orderId, customerId],
          )
        ).rows[0]?.intent ?? null
      );
    },

    /** null when there is none, or it never reached an intent. */
    recordPromotions: (orderId, customerId, priced, now) =>
      transact(async (tx) => {
        const o = priced.outcome;
        await tx.query(`UPDATE public."order" SET delivery_discount_amount = $2::numeric, updated_at = now() WHERE id = $1`, [
          orderId,
          formatCents(o.deliveryDiscountCents),
        ]);
        await tx.query(`UPDATE public.order_item SET discount_amount = 0 WHERE order_id = $1`, [orderId]);
        for (const [variantId, cents] of Object.entries(o.lineDiscounts)) {
          await tx.query(`UPDATE public.order_item SET discount_amount = $3::numeric WHERE order_id = $1 AND variant_id = $2`, [
            orderId,
            variantId,
            formatCents(cents),
          ]);
        }
        await tx.query(`DELETE FROM public.order_promotion WHERE order_id = $1`, [orderId]);
        for (const a of o.applied) {
          const rec = priced.records.get(a.promotionId);
          await tx.query(
            `INSERT INTO public.order_promotion (order_id, promotion_id, code_id, code_text, name, headline, kind, goods_amount, delivery_amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9::numeric)`,
            [orderId, a.promotionId, a.codeId, a.codeText, rec?.name ?? "Promotion", rec?.headline ?? null, a.kind, formatCents(a.goodsCents), formatCents(a.deliveryCents)],
          );
        }
        const holdMin = (
          await tx.query<{ m: number }>(`SELECT coalesce((SELECT slot_hold_min FROM public.delivery_settings WHERE id = 1), 10)::int AS m`)
        ).rows[0]!.m;
        await holdUses(tx, {
          orderId,
          customerId,
          applied: o.applied.filter((a) => !a.awaitingDeliveryFee),
          singleUseCodeIds: priced.singleUseCodeIds,
          expiresAt: new Date(now.getTime() + holdMin * 60_000),
          now,
        });
      }),

    async pendingOrderIntent(customerId) {
      const row = (
        await db.query<{ order_id: string; intent: string }>(
          `
SELECT o.id::text AS order_id, COALESCE(pay.stripe_payment_intent_id, '') AS intent
FROM public."order" o
LEFT JOIN public.payment pay ON pay.order_id = o.id
WHERE o.customer_id = $1 AND o.status = 'pending_payment'
ORDER BY o.created_at DESC
LIMIT 1`,
          [customerId],
        )
      ).rows[0];
      return row && row.intent !== "" ? { orderId: row.order_id, intentId: row.intent } : null;
    },

    /** Called after the payment has committed. */
    async savePaymentMethod(orderId, m) {
      await db.query(
        `
UPDATE public.payment
   SET method_type  = NULLIF($2, ''),
       method_brand = NULLIF($3, ''),
       method_last4 = NULLIF($4, ''),
       updated_at   = now()
 WHERE order_id = $1`,
        [orderId, m.type, m.brand, m.last4],
      );
    },
  };
}
