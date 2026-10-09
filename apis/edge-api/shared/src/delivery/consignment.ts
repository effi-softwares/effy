import type { ConsignmentEventKind, ConsignmentState } from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { enqueueOrderDeliveredIfComplete } from "../lib/order-completion";
import { deliveredBySql } from "./delivery-type";

/**
 * Courier consignments (080) — the ONE writer of `courier_consignment`, its events, a parcel's carrier
 * handover, and a courier order's collection mode. `consignment.guard.test.ts` fails a second one.
 *
 * ⚠ "HANDED OVER" IS STILL `carrier_handoff` AND "DELIVERED" IS STILL `package_arrival` (053). A
 * consignment holds the booking and the journey around those two facts; every function here that
 * moves a parcel past one of them writes it in the caller's transaction, so `packageStatus`, the
 * arrival guard and order completion read exactly what they always have.
 *
 * Every function takes the caller's transaction and does NOT announce: the caller announces after
 * it commits.
 */

/** A refusal a person can act on. `code` is the API's problem code. */
export class ConsignmentRefusal extends Error {
  constructor(readonly code: ConsignmentRefusalCode, message: string) {
    super(message);
    this.name = "ConsignmentRefusal";
  }
}
export type ConsignmentRefusalCode =
  | "not_found" | "not_courier" | "not_collected" | "not_ready" | "not_standard" | "not_carrier"
  | "service_unavailable" | "service_not_supplier" | "consignment_handed_over" | "not_booked"
  | "invalid_step" | "collection_locked" | "collection_assigned" | "pickup_in_past";

export type ConsignmentActor = { kind: "staff"; sub: string } | { kind: "shop"; sub: string; staffId: string | null };

/** 'hub' | 'supplier' for the package joined as `sf` under its order `o` — the one definition. */
export const COURIER_COLLECTION_SQL = (orderAlias: string): string =>
  `public.courier_parcel_collection(${orderAlias}.delivery_type, ${orderAlias}.courier_collection)`;

/** Problem steps: each keeps the parcel a Problem until a later `resolved` or `delivered`. */
export const PROBLEM_KINDS: ReadonlySet<string> = new Set(["failed", "lost", "damaged", "returned"]);

interface PackageRow {
  id: string;
  order_id: string;
  status: string;
  method: string | null;
  delivered_by: "effy" | "courier";
  collection: "hub" | "supplier";
  order_service_id: string | null;
  customer_sub: string;
  handed_over: boolean;
}

/**
 * The package, LOCKED. ⚠ The lock is its own statement, taken before the read (079's finding in the
 * arrival write): a caller that waited for the lock then reads everything the winner wrote.
 */
async function lockPackage(tx: Queryable, packageId: string): Promise<PackageRow> {
  await tx.query(`SELECT 1 FROM public.shop_fulfillment WHERE id = $1 FOR UPDATE`, [packageId]);
  const row = (
    await tx.query<PackageRow>(
      `SELECT sf.id::text AS id, sf.order_id::text AS order_id, sf.status, opd.method,
              ${deliveredBySql("o", "opd.method", "opd.slot_id")} AS delivered_by,
              ${COURIER_COLLECTION_SQL("o")} AS collection,
              o.courier_service_id::text AS order_service_id,
              c.cognito_sub AS customer_sub,
              EXISTS (SELECT 1 FROM public.carrier_handoff h WHERE h.shop_fulfillment_id = sf.id) AS handed_over
         FROM public.shop_fulfillment sf
         JOIN public."order" o ON o.id = sf.order_id
         JOIN public.customer c ON c.id = o.customer_id
    LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
        WHERE sf.id = $1`,
      [packageId],
    )
  ).rows[0];
  if (!row) throw new ConsignmentRefusal("not_found", "that package does not exist");
  return row;
}

interface LiveConsignment {
  id: string;
  state: ConsignmentState;
  courier_service_id: string;
}

async function liveConsignment(tx: Queryable, packageId: string): Promise<LiveConsignment | null> {
  return (
    (
      await tx.query<LiveConsignment>(
        `SELECT id::text AS id, state, courier_service_id::text AS courier_service_id
           FROM public.courier_consignment WHERE shop_fulfillment_id = $1 AND state <> 'cancelled'`,
        [packageId],
      )
    ).rows[0] ?? null
  );
}

async function appendEvent(tx: Queryable, consignmentId: string, kind: ConsignmentEventKind, actor: ConsignmentActor, note: string | null): Promise<void> {
  await tx.query(
    `INSERT INTO public.courier_consignment_event (consignment_id, kind, actor_kind, actor_sub, note) VALUES ($1, $2, $3, $4, $5)`,
    [consignmentId, kind, actor.kind, actor.sub, note],
  );
}

async function setState(tx: Queryable, consignmentId: string, state: ConsignmentState): Promise<void> {
  await tx.query(`UPDATE public.courier_consignment SET state = $2, updated_at = now() WHERE id = $1`, [consignmentId, state]);
}

const trimmed = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

// ── Booking ──────────────────────────────────────────────────────────────────────────────────────

export interface BookConsignmentInput {
  packageId: string;
  serviceId: string;
  reference?: string | null;
  trackingUrl?: string | null;
  labelKey?: string | null;
  pickup?: { date: string; from?: string | null; to?: string | null } | null;
  actor: { kind: "staff"; sub: string };
  now: Date;
}

/**
 * Book a consignment, or edit the booking. After handover only the reference, tracking link and
 * label may change — the service and how it reached the courier are history by then.
 */
export async function bookConsignment(tx: Queryable, input: BookConsignmentInput): Promise<{ consignmentId: string; created: boolean }> {
  const pkg = await lockPackage(tx, input.packageId);
  if (pkg.delivered_by !== "courier") throw new ConsignmentRefusal("not_courier", "Effy delivers this package; there is no courier to book");

  const service = (
    await tx.query<{ status: string; collects_from_supplier: boolean }>(
      `SELECT status, collects_from_supplier FROM public.courier_service WHERE id = $1`,
      [input.serviceId],
    )
  ).rows[0];
  const live = await liveConsignment(tx, input.packageId);
  const handed = live !== null && live.state !== "booked";
  if (!handed) {
    if (!service || service.status !== "active") throw new ConsignmentRefusal("service_unavailable", "that courier service is not in use");
    if (pkg.collection === "supplier" && !service.collects_from_supplier) {
      throw new ConsignmentRefusal("service_not_supplier", "that courier service does not collect from suppliers");
    }
  } else if (live.courier_service_id !== input.serviceId) {
    throw new ConsignmentRefusal("consignment_handed_over", "the parcel is with the courier; its service can no longer change");
  }
  const pickup = pkg.collection === "supplier" ? input.pickup ?? null : null;
  if (pickup && !handed) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(input.now);
    if (pickup.date < today) throw new ConsignmentRefusal("pickup_in_past", "the pickup day has passed");
  }

  const values = [
    trimmed(input.reference), trimmed(input.trackingUrl), trimmed(input.labelKey),
    pickup?.date ?? null, trimmed(pickup?.from), trimmed(pickup?.to),
  ];
  if (live) {
    await tx.query(
      `UPDATE public.courier_consignment
          SET reference = $2, tracking_url = $3, label_key = COALESCE($4, label_key),
              pickup_date = CASE WHEN state = 'booked' THEN $5::date ELSE pickup_date END,
              pickup_from = CASE WHEN state = 'booked' THEN $6::time ELSE pickup_from END,
              pickup_to   = CASE WHEN state = 'booked' THEN $7::time ELSE pickup_to END,
              courier_service_id = $8, updated_at = now()
        WHERE id = $1`,
      [live.id, ...values, input.serviceId],
    );
    return { consignmentId: live.id, created: false };
  }
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO public.courier_consignment
           (shop_fulfillment_id, courier_service_id, collection, reference, tracking_url, label_key,
            pickup_date, pickup_from, pickup_to, state, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::time, $9::time, 'booked', $10)
       RETURNING id::text AS id`,
      [input.packageId, input.serviceId, pkg.collection, ...values, input.actor.sub],
    )
  ).rows[0]!.id;
  await appendEvent(tx, id, "booked", input.actor, null);
  return { consignmentId: id, created: true };
}

// ── Handover ─────────────────────────────────────────────────────────────────────────────────────

export interface HandOverInput {
  packageId: string;
  actor: ConsignmentActor;
  /** 053's free-text fields, still accepted from the hub screen. Folded into the consignment. */
  reference?: string | null;
  carrierName?: string | null;
  note?: string | null;
}

export interface HandOverResult {
  /** false when it was already handed over — the idempotent replay. */
  created: boolean;
  handedOverAt: string;
  reference: string | null;
  carrierName: string | null;
  orderId: string;
  consignmentId: string | null;
}

/**
 * A parcel leaves Effy's or the supplier's hands for a courier: writes `carrier_handoff` (053's one
 * record of it), creates or completes the consignment, and tells the customer (080 FR-022).
 *
 *   via the hub         the package must be `collected` (a driver brought it in) — 053's rule;
 *   from the supplier   the package must be `ready_for_pickup` or `collected`; it becomes `collected`
 *                       (it left the shop), with the shop's accountability event.
 *
 * ⚠ A package Effy delivers itself never passes to a carrier (`not_standard` for same-day,
 * `not_carrier` for a later-day window — 053/078's codes).
 */
export async function handOver(tx: Queryable, input: HandOverInput): Promise<HandOverResult> {
  const pkg = await lockPackage(tx, input.packageId);

  const existing = (
    await tx.query<{ handed_over_at: Date; reference: string | null; carrier_name: string | null }>(
      `SELECT handed_over_at, reference, carrier_name FROM public.carrier_handoff WHERE shop_fulfillment_id = $1`,
      [input.packageId],
    )
  ).rows[0];
  const live = await liveConsignment(tx, input.packageId);
  if (existing) {
    return {
      created: false, handedOverAt: new Date(existing.handed_over_at).toISOString(),
      reference: existing.reference, carrierName: existing.carrier_name, orderId: pkg.order_id, consignmentId: live?.id ?? null,
    };
  }

  if (pkg.delivered_by === "effy") {
    throw new ConsignmentRefusal(pkg.method === "same_day" ? "not_standard" : "not_carrier", "an Effy driver delivers this package");
  }
  if (pkg.collection === "supplier") {
    if (pkg.status !== "ready_for_pickup" && pkg.status !== "collected") throw new ConsignmentRefusal("not_ready", "the package is not packed yet");
    if (input.actor.kind === "shop" && !live) throw new ConsignmentRefusal("not_booked", "no courier pickup has been booked for this package");
  } else {
    if (pkg.status !== "collected") throw new ConsignmentRefusal("not_collected", "a driver has not brought this package to the hub yet");
    if (input.actor.kind === "shop") throw new ConsignmentRefusal("not_found", "that package does not exist");
  }

  // The consignment: the booked one, or — for a hub handover nobody booked — one from the service
  // the order was sold. An order from before 080 has no service and gets none (FR-010).
  let consignmentId = live?.id ?? null;
  const serviceId = live?.courier_service_id ?? pkg.order_service_id;
  if (!consignmentId && serviceId) {
    consignmentId = (
      await tx.query<{ id: string }>(
        `INSERT INTO public.courier_consignment (shop_fulfillment_id, courier_service_id, collection, reference, state, created_by)
         VALUES ($1, $2, $3, $4, 'handed_over', $5) RETURNING id::text AS id`,
        [input.packageId, serviceId, pkg.collection, trimmed(input.reference), input.actor.sub],
      )
    ).rows[0]!.id;
  } else if (consignmentId && trimmed(input.reference)) {
    await tx.query(`UPDATE public.courier_consignment SET reference = COALESCE(reference, $2) WHERE id = $1`, [consignmentId, trimmed(input.reference)]);
  }

  const names = consignmentId
    ? (
        await tx.query<{ reference: string | null; courier_name: string }>(
          `SELECT c.reference, s.courier_name FROM public.courier_consignment c JOIN public.courier_service s ON s.id = c.courier_service_id WHERE c.id = $1`,
          [consignmentId],
        )
      ).rows[0]
    : undefined;
  const reference = names?.reference ?? trimmed(input.reference);
  const carrierName = names?.courier_name ?? trimmed(input.carrierName);

  const handed = (
    await tx.query<{ handed_over_at: Date }>(
      `INSERT INTO public.carrier_handoff (shop_fulfillment_id, reference, carrier_name, recorded_by_sub, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING handed_over_at`,
      [input.packageId, reference, carrierName, input.actor.sub, trimmed(input.note)],
    )
  ).rows[0]!;

  if (pkg.status === "ready_for_pickup") {
    await tx.query(
      `UPDATE public.shop_fulfillment SET status = 'collected', state_changed_at = now(), updated_at = now() WHERE id = $1`,
      [input.packageId],
    );
    await tx.query(
      `INSERT INTO public.fulfillment_event (shop_fulfillment_id, actor_staff_id, event_type, from_status, to_status)
       VALUES ($1, $2, 'state_changed', 'ready_for_pickup', 'collected')`,
      [input.packageId, input.actor.kind === "shop" ? input.actor.staffId : null],
    );
  }

  if (consignmentId) {
    await setState(tx, consignmentId, "handed_over");
    await appendEvent(tx, consignmentId, "handed_over", input.actor, trimmed(input.note));
    // ⚠ ONE per consignment (the dedupe key is the consignment id). The payload names the
    // consignment and nothing else; the worker reads what it may say.
    // ⚠ PUSH AND EMAIL. The email is the per-parcel tracking the order page promises when an order
    // travels as more than one consignment (Q8); a push alone would leave a web-only shopper with
    // nothing. The address is snapshotted now (052's rule). Routing ids only in the payload.
    await tx.query(
      `INSERT INTO public.notification_request
           (recipient_sub, audience, type, channel, recipient_email, payload, dedupe_key)
       SELECT c.cognito_sub, 'customer', 'order_with_courier', ch.channel,
              CASE WHEN ch.channel = 'email' THEN c.email ELSE NULL END,
              jsonb_build_object('entityId', $2::text, 'deepLink', 'effy://order'),
              'order_with_courier:' || ch.channel || ':' || c.cognito_sub || ':' || $2::text
         FROM public."order" o
         JOIN public.customer c ON c.id = o.customer_id
        CROSS JOIN (VALUES ('push'), ('email')) AS ch(channel)
        WHERE o.id = $1
          AND (ch.channel <> 'email' OR c.email IS NOT NULL)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [pkg.order_id, consignmentId],
    );
  }

  return {
    created: true, handedOverAt: new Date(handed.handed_over_at).toISOString(),
    reference, carrierName, orderId: pkg.order_id, consignmentId,
  };
}

// ── Progress ─────────────────────────────────────────────────────────────────────────────────────

export interface ConsignmentStepInput {
  packageId: string;
  kind: "in_transit" | "delivered" | "failed" | "lost" | "damaged" | "returned" | "resolved" | "cancelled";
  actor: { kind: "staff"; sub: string };
  note?: string | null;
}

/**
 * Record a step after booking. `delivered` writes the arrival (053), advances the package and, when
 * it was the last, the order's completion notice — the same writes as a staff-recorded arrival.
 *
 *   cancelled   only before handover;
 *   resolved    only while a problem is open — the parcel goes back to where it was before it;
 *   everything else only after handover.
 */
export async function recordConsignmentStep(tx: Queryable, input: ConsignmentStepInput): Promise<{ orderId: string; orderFinished: boolean }> {
  const pkg = await lockPackage(tx, input.packageId);
  const live = await liveConsignment(tx, input.packageId);
  if (!live) throw new ConsignmentRefusal("not_booked", "this package has no consignment");
  const note = trimmed(input.note);
  const refuse = (): never => {
    throw new ConsignmentRefusal("invalid_step", `a ${live.state.replace("_", " ")} consignment cannot be marked ${input.kind.replace("_", " ")}`);
  };

  let next: ConsignmentState = live.state;
  if (input.kind === "cancelled") {
    if (live.state !== "booked") refuse();
    next = "cancelled";
  } else if (live.state === "booked" || live.state === "delivered") {
    refuse();
  } else if (input.kind === "resolved") {
    if (!PROBLEM_KINDS.has(live.state)) refuse();
    // Back to where it was before the problem: in transit if it ever was, else handed over.
    const was = (
      await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.courier_consignment_event WHERE consignment_id = $1 AND kind = 'in_transit'`, [live.id])
    ).rows[0]!.n;
    next = was > 0 ? "in_transit" : "handed_over";
  } else if (input.kind === "in_transit") {
    if (PROBLEM_KINDS.has(live.state)) refuse();
    next = "in_transit";
  } else {
    next = input.kind; // delivered, or a problem
  }

  let orderFinished = false;
  if (input.kind === "delivered") {
    await tx.query(
      `INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub, note)
       VALUES ($1, 'staff_recorded', $2, $3) ON CONFLICT (shop_fulfillment_id) DO NOTHING`,
      [input.packageId, input.actor.sub, note],
    );
    const advanced = await tx.query(
      `UPDATE public.shop_fulfillment SET status = 'delivered', state_changed_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'collected'`,
      [input.packageId],
    );
    if ((advanced.rowCount ?? 0) > 0) {
      await tx.query(
        `INSERT INTO public.fulfillment_event (shop_fulfillment_id, event_type, from_status, to_status) VALUES ($1, 'state_changed', 'collected', 'delivered')`,
        [input.packageId],
      );
    }
    orderFinished = await enqueueOrderDeliveredIfComplete(tx, pkg.order_id);
  }

  await setState(tx, live.id, next);
  await appendEvent(tx, live.id, input.kind, input.actor, note);
  return { orderId: pkg.order_id, orderFinished };
}

// ── The mode ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Change how one courier order's parcels reach the courier (080 FR-003).
 *
 * ⚠ REFUSED once anything has left: a handover recorded, or a driver has picked a package up. Moving
 * to `supplier` is also refused while a driver is ASSIGNED to collect one of its packages — staff
 * unassign it first (073's Unassign): this service does not own driver work.
 */
export async function changeCourierCollection(
  tx: Queryable,
  input: { orderId: string; to: "hub" | "supplier"; actorSub: string; note?: string | null },
): Promise<{ changed: boolean; packageIds: string[] }> {
  const order = (
    await tx.query<{ delivery_type: string | null; courier_collection: "hub" | "supplier" | null }>(
      `SELECT delivery_type, courier_collection FROM public."order" WHERE id = $1 FOR UPDATE`,
      [input.orderId],
    )
  ).rows[0];
  if (!order) throw new ConsignmentRefusal("not_found", "that order does not exist");
  if (order.delivery_type !== "courier" || !order.courier_collection) throw new ConsignmentRefusal("not_courier", "Effy delivers this order");
  const packageIds = (
    await tx.query<{ id: string }>(`SELECT id::text AS id FROM public.shop_fulfillment WHERE order_id = $1`, [input.orderId])
  ).rows.map((r) => r.id);
  if (order.courier_collection === input.to) return { changed: false, packageIds };

  const blocked = (
    await tx.query<{ left: boolean; assigned: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.carrier_handoff h JOIN public.shop_fulfillment sf ON sf.id = h.shop_fulfillment_id WHERE sf.order_id = $1)
              OR EXISTS (SELECT 1 FROM public.round_package rp JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
                          WHERE sf.order_id = $1 AND rp.state = 'picked_up') AS left,
              EXISTS (SELECT 1 FROM public.round_package rp JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
                       WHERE sf.order_id = $1 AND rp.state = 'assigned') AS assigned`,
      [input.orderId],
    )
  ).rows[0]!;
  if (blocked.left) throw new ConsignmentRefusal("collection_locked", "a parcel of this order has already left; it can no longer change");
  if (input.to === "supplier" && blocked.assigned) {
    throw new ConsignmentRefusal("collection_assigned", "a driver is assigned to collect this order — unassign them first");
  }

  await tx.query(`UPDATE public."order" SET courier_collection = $2, updated_at = now() WHERE id = $1`, [input.orderId, input.to]);
  await tx.query(
    `INSERT INTO public.order_courier_collection_change (order_id, from_mode, to_mode, actor_sub, note) VALUES ($1, $2, $3, $4, $5)`,
    [input.orderId, order.courier_collection, input.to, input.actorSub, trimmed(input.note)],
  );
  // A booking made for the other way is cancelled: a supplier pickup is not a hub collection.
  const booked = (
    await tx.query<{ id: string }>(
      `SELECT c.id::text AS id FROM public.courier_consignment c JOIN public.shop_fulfillment sf ON sf.id = c.shop_fulfillment_id
        WHERE sf.order_id = $1 AND c.state = 'booked'`,
      [input.orderId],
    )
  ).rows;
  for (const b of booked) {
    await setState(tx, b.id, "cancelled");
    await appendEvent(tx, b.id, "cancelled", { kind: "staff", sub: input.actorSub }, "collection changed");
  }
  return { changed: true, packageIds };
}

/**
 * 081 — give an order its courier routing, or take it away, when back-office moves it between Effy and
 * courier delivery (`@effy/edge-shared/delivery` override.ts, in its transaction).
 *
 *   to courier (`routing` given): the courier service the customer is told about and how its parcels
 *     reach the courier. The order had no mode, so nothing is "changed" and no history row is written —
 *     the move itself is the record (`delivery_override`).
 *   back to Effy (`routing` null): both cleared, and every booking not yet handed over is cancelled.
 *     ⚠ REFUSED once any parcel has been handed to a courier: the courier has it.
 *
 * ⚠ It does not announce; the caller does after commit.
 */
export async function setCourierRouting(
  tx: Queryable,
  orderId: string,
  routing: { serviceId: string; collection: "hub" | "supplier" } | null,
  actorSub: string,
): Promise<void> {
  if (routing) {
    await tx.query(
      `UPDATE public."order" SET courier_service_id = $2::uuid, courier_collection = $3, updated_at = now() WHERE id = $1`,
      [orderId, routing.serviceId, routing.collection],
    );
    return;
  }

  const handed = (
    await tx.query<{ handed: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.carrier_handoff h JOIN public.shop_fulfillment sf ON sf.id = h.shop_fulfillment_id WHERE sf.order_id = $1)
           OR EXISTS (SELECT 1 FROM public.courier_consignment c JOIN public.shop_fulfillment sf ON sf.id = c.shop_fulfillment_id
                       WHERE sf.order_id = $1 AND c.state NOT IN ('booked', 'cancelled')) AS handed`,
      [orderId],
    )
  ).rows[0]!.handed;
  if (handed) throw new ConsignmentRefusal("consignment_handed_over", "a parcel of this order is already with the courier");

  const booked = (
    await tx.query<{ id: string }>(
      `SELECT c.id::text AS id FROM public.courier_consignment c JOIN public.shop_fulfillment sf ON sf.id = c.shop_fulfillment_id
        WHERE sf.order_id = $1 AND c.state = 'booked'`,
      [orderId],
    )
  ).rows;
  for (const b of booked) {
    await setState(tx, b.id, "cancelled");
    await appendEvent(tx, b.id, "cancelled", { kind: "staff", sub: actorSub }, "moved to delivery by Effy");
  }
  await tx.query(
    `UPDATE public."order" SET courier_service_id = NULL, courier_collection = NULL, updated_at = now() WHERE id = $1`,
    [orderId],
  );
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────

export interface ConsignmentRow {
  id: string;
  package_id: string;
  service_id: string;
  courier_name: string;
  service_name: string;
  collection: "hub" | "supplier";
  reference: string | null;
  tracking_url: string | null;
  label_key: string | null;
  pickup_date: string | null;
  pickup_from: string | null;
  pickup_to: string | null;
  state: ConsignmentState;
  events: { kind: ConsignmentEventKind; actor_kind: "staff" | "shop"; actor_sub: string; note: string | null; at: string }[];
}

/** The live consignment of each package (cancelled ones are history and are not returned). */
export async function consignmentsFor(q: Queryable, packageIds: readonly string[]): Promise<Map<string, ConsignmentRow>> {
  if (packageIds.length === 0) return new Map();
  const rows = (
    await q.query<ConsignmentRow>(
      `SELECT c.id::text AS id, c.shop_fulfillment_id::text AS package_id, s.id::text AS service_id,
              s.courier_name, s.service_name, c.collection, c.reference, c.tracking_url, c.label_key,
              c.pickup_date::text AS pickup_date, to_char(c.pickup_from, 'HH24:MI') AS pickup_from,
              to_char(c.pickup_to, 'HH24:MI') AS pickup_to, c.state,
              COALESCE((SELECT json_agg(json_build_object('kind', e.kind, 'actor_kind', e.actor_kind, 'actor_sub', e.actor_sub,
                                                          'note', e.note, 'at', e.created_at) ORDER BY e.created_at)
                          FROM public.courier_consignment_event e WHERE e.consignment_id = c.id), '[]'::json) AS events
         FROM public.courier_consignment c
         JOIN public.courier_service s ON s.id = c.courier_service_id
        WHERE c.shop_fulfillment_id = ANY($1::uuid[]) AND c.state <> 'cancelled'`,
      [packageIds],
    )
  ).rows;
  return new Map(rows.map((r) => [r.package_id, r]));
}
