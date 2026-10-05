// The checkout store: SQL only. What the charge is computed from, and the pending order it is
// recorded against. Payment FINALISATION is not here — it is `@effy/edge-shared/payments`.
import {
  availabilityPredicate, formatCents, parseCents, pooled, withTransaction, type Queryable, type Transactor,
} from "@effy/edge-shared";
import {
  judgeSlot, loadSlotSettings, lockSlot, melbourneDate, sameDaySchedule, slotLoad, type SlotVerdict,
} from "@effy/edge-shared/delivery";
import type { PaymentMethodSummary } from "@effy/edge-shared/payments";
import { randomBytes } from "node:crypto";

export interface CheckoutLine {
  productId: string;
  shopId: string;
  name: string;
  unitCents: number;
  /** What will be CHARGED — already capped at what the shop can supply (054 FR-020). */
  quantity: number;
  /** What the cart asked for, before that cap. */
  requestedQuantity: number;
  /** Per-unit logistics weight; a package's weight is Σ(weight × quantity) per shop (047). */
  weightGrams: number;
  /** frozen | chilled | ambient — snapshotted so a driver is told what was SOLD (065). */
  storageClass: string;
  /** What the SHOP is owed per unit, beside what the customer pays (067). */
  shopUnitCents: number;
}

/** One package's resolved delivery, as captured on the order. */
export interface PackageDelivery {
  shopId: string;
  method: string;
  feeCents: number;
  /** yyyy-mm-dd, Melbourne. */
  promisedDay: string;
  slotId: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
}

export interface SlotHold {
  slotId: string;
  now: Date;
}

/** The place could not be held. Nothing was written. */
export class SlotUnavailableError extends Error {
  constructor(readonly verdict: Exclude<SlotVerdict, "open">) {
    super(`checkout: delivery slot unavailable (${verdict})`);
  }
}

export interface OrderAmounts {
  itemSubtotalCents: number;
  deliveryFeeCents: number;
  /** The platform's own discount computation at the moment of payment (027). */
  discountCents: number;
  promoCodeId: string | null;
  /** The literal text, denormalised so the receipt can still name it. */
  promoCode: string | null;
  grandTotalCents: number;
  currency: string;
}

export interface PaymentProfile {
  /** null when the shopper has never paid. */
  providerCustomerId: string | null;
  email: string;
  name: string;
}

interface LineRow {
  product_id: string;
  shop_id: string;
  name: string;
  unit_price_amount: string;
  shop_unit_price_amount: string;
  quantity: number;
  requested_quantity: number;
  weight_grams: number;
  storage_class: string;
}

const storageClassOrAmbient = (c: string) => (c === "frozen" || c === "chilled" ? c : "ambient");

/** `EFY-` + six characters from an alphabet with no look-alikes (no I, L, O, U). */
export function generateOrderNumber(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 symbols: a byte maps onto it without bias
  return `EFY-${[...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join("")}`;
}

export interface CheckoutStore {
  cartLines(customerId: string): Promise<CheckoutLine[]>;
  addressSnapshot(customerId: string, addressId: string): Promise<Record<string, unknown> | null>;
  paymentProfile(customerId: string): Promise<PaymentProfile>;
  setProviderCustomerId(customerId: string, providerCustomerId: string): Promise<void>;
  upsertPendingOrder(
    customerId: string, amounts: OrderAmounts, address: Record<string, unknown>, lines: readonly CheckoutLine[], reusePending: boolean,
  ): Promise<{ orderId: string; orderNumber: string }>;
  setOrderBilling(orderId: string, billing: Record<string, unknown> | null): Promise<void>;
  setOrderDeliveryInstructions(orderId: string, handover: string | null, note: string | null): Promise<void>;
  captureDelivery(
    orderId: string, quote: unknown, expiresAt: Date, pkgs: readonly PackageDelivery[], hold: SlotHold | null,
  ): Promise<Date | null>;
  upsertPayment(orderId: string, intentId: string, amountCents: number, status: string): Promise<void>;
  orderIntentForCustomer(customerId: string, orderId: string): Promise<string | null>;
  pendingOrderIntent(customerId: string): Promise<{ orderId: string; intentId: string } | null>;
  savePaymentMethod(orderId: string, m: PaymentMethodSummary): Promise<void>;
}

/** The order a PaymentIntent belongs to. Takes the caller's connection: the webhook runs it in a transaction. */
export async function findOrderByIntent(q: Queryable, intentId: string): Promise<string | null> {
  return (
    (await q.query<{ order_id: string }>(`SELECT order_id::text AS order_id FROM public.payment WHERE stripe_payment_intent_id = $1`, [intentId]))
      .rows[0]?.order_id ?? null
  );
}

export function createCheckoutStore(db: Queryable = pooled, transact: Transactor = withTransaction): CheckoutStore {
  return {
    /** The customer's PAYABLE cart lines, each already capped at what the shop can supply. */
    async cartLines(customerId) {
      const rows = (
        await db.query<LineRow>(
          `
SELECT ci.product_id::text AS product_id,
       p.shop_id::text     AS shop_id,
       p.name              AS name,
       p.price_amount::text AS unit_price_amount,
       -- 067: price_amount is what the CUSTOMER pays and is what is charged. The shop's own price
       -- rides beside it; NULL on a row written before 067 means "the same".
       COALESCE(p.shop_price_amount, p.price_amount)::text AS shop_unit_price_amount,
       -- ⚠ 054 FR-020: the quantity PAID FOR is capped at what the shop can supply. Without this a
       -- line asking for 5 with 2 on the shelf would create a charge for 5, and the shopper would
       -- pay in full for three units that do not exist.
       -- ⚠ In SQL, not in code, so it cannot be forgotten by a second caller of this read.
       LEAST(ci.quantity,
             CASE WHEN p.stock_tracked THEN p.stock_on_hand ELSE ci.quantity END) AS quantity,
       ci.quantity         AS requested_quantity,
       p.weight_grams      AS weight_grams,
       -- ⚠ 065: storage is a product ATTRIBUTE, not a column. Anything that is not exactly frozen
       -- or chilled is ambient, INCLUDING a value the back office adds later: the order line's
       -- CHECK admits three values, and an unrecognised fourth must not fail a shopper's payment.
       COALESCE((
           SELECT CASE WHEN pav.value_text IN ('frozen', 'chilled') THEN pav.value_text END
             FROM public.product_attribute_value pav
             JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
            WHERE pav.product_id = p.id AND ad.key = 'storage'
            LIMIT 1), 'ambient') AS storage_class
FROM public.cart c
JOIN public.cart_item ci ON ci.cart_id = c.id
JOIN public.product p ON p.id = ci.product_id
WHERE c.customer_id = $1 AND ${availabilityPredicate("p")}
ORDER BY ci.added_at ASC`,
          [customerId],
        )
      ).rows;
      return rows.map((r) => ({
        productId: r.product_id, shopId: r.shop_id, name: r.name,
        unitCents: parseCents(r.unit_price_amount), shopUnitCents: parseCents(r.shop_unit_price_amount),
        quantity: r.quantity, requestedQuantity: r.requested_quantity,
        weightGrams: r.weight_grams, storageClass: r.storage_class,
      }));
    },

    /** The address as it will be snapshotted onto the order, scoped to its owner; null if absent. */
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

    /**
     * What the provider needs to identify this shopper.
     *
     * ⚠ The email and name come from the PLATFORM RECORD, never from a token claim or a request
     * body — they are what the provider shows on a receipt, and a client must not be able to set
     * them. ⚠ The name is TWO columns (given + family); a single display-name column was dropped.
     */
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

    /** First-wins: a retried intent cannot overwrite the reference or trip its UNIQUE constraint. */
    async setProviderCustomerId(customerId, providerCustomerId) {
      await db.query(
        `UPDATE public.customer SET stripe_customer_id = $2, updated_at = now()
		 WHERE id = $1 AND stripe_customer_id IS NULL`,
        [customerId, providerCustomerId],
      );
    },

    /**
     * Locate or create the pending order, set its amounts and address snapshot, and replace its
     * lines — the intent-time snapshot that fixes the charge.
     *
     * ⚠ `reusePending` IS A SAFETY DECISION, AND IT IS NOT THE STORE'S TO MAKE. Recycling the
     * customer's open order is right only while that order's payment attempt is still LIVE;
     * recycling one whose intent has already settled is what makes a second checkout resolve to the
     * FIRST one's payment. Only the service can decide, because only the provider knows.
     */
    upsertPendingOrder: (customerId, a, address, lines, reusePending) =>
      transact(async (tx) => {
        let existing: { id: string; order_number: string } | undefined;
        if (reusePending) {
          // ⚠ `ORDER BY created_at DESC`: a customer CAN hold more than one pending order (a row
          // that could not be safely recycled is left behind), so a bare LIMIT 1 is a coin toss.
          // ⚠ `FOR UPDATE` serialises two concurrent checkouts for one shopper. Without it both
          // read the same row and both rewrite its lines, and which basket survives is a race.
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
     discount_amount, promo_code_id, promo_code, grand_total_amount, delivery_address, delivery_fee_amount)
VALUES ($1, $2, 'pending_payment', $3, $4::numeric,
        $7::numeric, $8::uuid, $9, $5::numeric, $6::jsonb, $10::numeric)
RETURNING id::text AS id`,
              [
                customerId, orderNumber, a.currency, formatCents(a.itemSubtotalCents), formatCents(a.grandTotalCents),
                JSON.stringify(address), formatCents(a.discountCents), a.promoCodeId, a.promoCode, formatCents(a.deliveryFeeCents),
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
    discount_amount=$5::numeric, promo_code_id=$6::uuid, promo_code=$7,
    delivery_fee_amount=$8::numeric,
    updated_at=now() WHERE id=$1`,
            [
              orderId, formatCents(a.itemSubtotalCents), formatCents(a.grandTotalCents), JSON.stringify(address),
              formatCents(a.discountCents), a.promoCodeId, a.promoCode, formatCents(a.deliveryFeeCents),
            ],
          );
          await tx.query(`DELETE FROM public.order_item WHERE order_id = $1`, [orderId]);
        }

        for (const l of lines) {
          // 067 — BOTH prices are fixed here, at placement. unit_price_amount is the customer's and
          // is what is charged; shop_unit_price_amount is what the shop is owed. Neither may move
          // once the order exists.
          await tx.query(
            `
INSERT INTO public.order_item
    (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount,
     storage_class, shop_unit_price_amount, shop_line_subtotal_amount)
VALUES ($1, $2, $3, $4, $5::numeric, $6, $7::numeric, $8, $9::numeric, $10::numeric)`,
            [
              orderId, l.productId, l.shopId, l.name, formatCents(l.unitCents), l.quantity, formatCents(l.unitCents * l.quantity),
              storageClassOrAmbient(l.storageClass), formatCents(l.shopUnitCents), formatCents(l.shopUnitCents * l.quantity),
            ],
          );
        }
        return { orderId, orderNumber };
      }),

    /** null writes NULL — "billing is the same as shipping" (023). Idempotent. */
    async setOrderBilling(orderId, billing) {
      await db.query(`UPDATE public."order" SET billing_address = $2::jsonb, updated_at = now() WHERE id = $1`, [
        orderId,
        billing === null ? null : JSON.stringify(billing),
      ]);
    },

    /**
     * What the customer told the driver (066). ⚠ Only a PENDING order is written: once an order is
     * paid nothing may change its instructions, and the predicate makes that true even for a caller
     * that tries.
     */
    async setOrderDeliveryInstructions(orderId, handover, note) {
      await db.query(
        `UPDATE public."order" SET delivery_handover = $2, delivery_note = $3, updated_at = now()
		  WHERE id = $1 AND status = 'pending_payment'`,
        [orderId, handover, note],
      );
    },

    /**
     * Write the captured per-package delivery and, with a hold, take a place in that slot.
     *
     * ⚠ THIS IS WHERE "NEVER CHARGED FOR A SLOT YOU DID NOT GET" IS DECIDED (069). The client
     * confirms payment with the provider directly, so this is the last moment the server can refuse
     * before the money moves. It runs before the payment intent is created; a refusal here rolls
     * back everything and leaves the order's previous capture — and any place it already held —
     * exactly as it was.
     */
    captureDelivery: (orderId, quote, expiresAt, pkgs, hold) =>
      transact(async (tx) => {
        // The order's own place is given up FIRST so it is not counted against itself: a shopper
        // refreshing the payment step in a capacity-1 slot must not be refused by their own hold.
        await tx.query(`DELETE FROM public.delivery_slot_booking WHERE order_id = $1`, [orderId]);

        let heldUntil: Date | null = null;
        if (hold) {
          // ⚠ The slot's row lock is the capacity guarantee: two shoppers taking the last place
          // are serialised here, and the second counts the first's hold.
          const slot = await lockSlot(tx, hold.slotId);
          if (!slot) throw new SlotUnavailableError("cutoff");
          const { runs, bufferMin } = await sameDaySchedule(tx);
          const settings = await loadSlotSettings(tx);
          const load = await slotLoad(tx, melbourneDate(hold.now));
          const judged = judgeSlot(hold.now, slot, load.get(slot.id) ?? 0, runs, bufferMin, settings.turnaroundMin);
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
UPDATE public."order" SET delivery_quote = $2::jsonb, delivery_quote_expires_at = $3, updated_at = now()
WHERE id = $1`,
          [orderId, JSON.stringify(quote), expiresAt],
        );
        await tx.query(`DELETE FROM public.order_package_delivery WHERE order_id = $1`, [orderId]);
        for (const p of pkgs) {
          await tx.query(
            `
INSERT INTO public.order_package_delivery
    (order_id, shop_id, method, delivery_fee_amount, promised_from, promised_to,
     slot_id, window_start, window_end)
VALUES ($1, $2, $3, $4::numeric, NULLIF($5, '')::date, NULLIF($5, '')::date,
        $6::uuid, $7, $8)`,
            [orderId, p.shopId, p.method, formatCents(p.feeCents), p.promisedDay, p.slotId, p.windowStart, p.windowEnd],
          );
        }
        return heldUntil;
      }),

    /** One payment per order: record or update it with the intent id and status. */
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

    /** The order's PaymentIntent id, scoped to the owner; null for another shopper's order. */
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

    /**
     * The customer's lingering `pending_payment` order and the intent recorded against it. null
     * when there is no such order, or it never got as far as an intent.
     */
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

    /** How an order was paid, for the receipt (052). Called AFTER the payment has committed. */
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
