/**
 * Moving an order between "Delivered by Effy" and "Courier delivery" from back-office, and making it
 * right with the customer (081).
 *
 * Contract: `specs/081-courier-override-compensation/contracts/routes.md`; decisions in its research.
 *
 * ⚠ ONE TRANSACTION, EVERY PART. A move releases (or takes) a window place, rewrites how the packages
 * are routed, takes them off drivers' rounds, gives the order its courier (or takes it away), records
 * the change through 079's one writer, and gives the compensation staff chose. Any part failing leaves
 * nothing changed (FR-003): a customer credited for a move that never happened, or moved without the
 * points they were shown, is the defect this file exists to make impossible.
 *
 * ⚠ IT WRITES THROUGH THE ONE WRITERS, NEVER AROUND THEM:
 *   the delivery type and its history     recordDeliveryType           (079)
 *   the courier service and mode          setCourierRouting            (080, consignment.ts)
 *   a driver's round                      removeAssignment             (073, driver-work.ts)
 *   points                                points.credit                (074)
 *   a refund                              recordRefundIn, then submitRecorded after commit (055)
 *   the window rule                       judgeWindow                  (078)
 *   the courier fee                       courierFee                   (077)
 *
 * ⚠ LOCK ORDER: the planner's pass lock FIRST (as every manual driver-work action takes it), then the
 * order row, then the payment row (a refund), then the customer's points (074's order).
 *
 * ⚠ Nothing here announces; the caller does after commit, with what `MoveResult` names.
 */
import type {
  AdminDeliveryMoveDTO, CustomerCompensationDTO, OrderDeliveryMoveDTO, DeliveryCompensationKind, DeliveryMoveChoiceDTO,
  DeliveryMovePreviewDTO, DeliveryMoveRefusal, DeliveryMoveWindowDTO, DeliveryType,
} from "@effy/shared-types";
import { formatArrival } from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { formatCents } from "../lib/money";
import { createRefundRepository, recordRefundIn } from "../payments/refunds/repository";
import { KIND_DELIVERY, REASON_COURIER_OVERRIDE } from "../payments/refunds/state";
import { credit } from "../points/ledger";
import { loadSettings as loadPointsSettings } from "../points/settings";
import { setCourierRouting } from "./consignment";
import { coverageForPostcode, loadCourierSettings } from "./coverage";
import { changeDeliveryType, deliveryTypeChangeNotes } from "./delivery-type";
import { PLANNER_PASS_LOCK, removeAssignment } from "./driver-work";
import { courierFee } from "./engine";
import { courierValues, loadActivePlan, NoActivePlanError } from "./plan";
import { melbourneDate, sameDaySchedule } from "./sameday";
import { judgeWindow, loadSlots, loadSlotSettings, lockSlot, slotLoad, slotLoadByDate } from "./slots";
import { nonDeliveryDates } from "./standard-days";
import { effyDays, openWindows } from "./windows";
import { normalizePostcode } from "./zone";

// ── Refusals ────────────────────────────────────────────────────────────────────────────────────

/** Each refusal in the one line staff read. The console says these words, not its own. */
export const MOVE_REFUSAL_WORDS: Record<DeliveryMoveRefusal, string> = {
  not_found: "That order does not exist.",
  not_paid: "Only a paid order can be moved.",
  no_delivery_type: "This order was placed before the new delivery model and keeps how it was sold.",
  already_courier: "This order is already going by courier.",
  already_effy: "Effy already delivers this order.",
  handed_over: "A parcel of this order is already with the courier.",
  delivered: "A parcel of this order has already been delivered.",
  out_for_delivery: "A parcel of this order is out for delivery. Wait until the driver's round settles it.",
  courier_not_ready: "Courier delivery is not set up: it needs an active courier fee table and a default courier service.",
  not_in_area: "Effy does not deliver to this address.",
  window_unavailable: "That window is no longer open or has no room. Choose another.",
  changed: "This order changed a moment ago. Showing the latest.",
  compensation_changed: "The amounts changed since you looked. Check them and confirm again.",
};

export class DeliveryMoveError extends Error {
  constructor(readonly code: DeliveryMoveRefusal, readonly preview?: DeliveryMovePreviewDTO) {
    super(MOVE_REFUSAL_WORDS[code]);
    this.name = "DeliveryMoveError";
  }
}

// ── Amounts (pure) ──────────────────────────────────────────────────────────────────────────────

export interface AmountsInput {
  /** What the customer paid for delivery (the order's stored delivery total). */
  paidCents: number;
  /** What the active courier fee table charges this basket now; null on a move back to Effy. */
  courierCents: number | null;
  centsPerPoint: number;
  /** What may still be refunded on the order (055's ceiling, card and points together). */
  refundableCents: number;
}

export interface Amounts {
  differenceCents: number | null;
  choices: Record<DeliveryCompensationKind, { cents: number; points: number | null }>;
}

/** Points worth `cents`, rounded UP — in the customer's favour. */
export const pointsFor = (cents: number, centsPerPoint: number): number => (cents <= 0 ? 0 : Math.ceil(cents / centsPerPoint));

/**
 * What each way of making it right gives (081 research R8).
 *
 * ⚠ THE DIFFERENCE NEVER GOES BELOW ZERO: a courier dearer than what the customer paid is Effy's cost,
 * and the customer is charged nothing (FR-010). ⚠ A card refund is capped at what may still be
 * refunded — the preview shows the cap rather than a figure the refund would refuse.
 */
export function overrideAmounts(a: AmountsInput): Amounts {
  const differenceCents = a.courierCents === null ? null : Math.max(0, a.paidCents - a.courierCents);
  const diff = differenceCents ?? 0;
  const cap = (c: number) => Math.max(0, Math.min(c, a.refundableCents));
  return {
    differenceCents,
    choices: {
      points_difference: { cents: diff, points: pointsFor(diff, a.centsPerPoint) },
      free_delivery_points: { cents: a.paidCents, points: pointsFor(a.paidCents, a.centsPerPoint) },
      free_delivery_refund: { cents: cap(a.paidCents), points: null },
      refund_difference: { cents: cap(diff), points: null },
      none: { cents: 0, points: null },
    },
  };
}

/** Every way of making it right, for validating a request. */
export const DELIVERY_COMPENSATION_KINDS_SET: ReadonlySet<string> = new Set<DeliveryCompensationKind>([
  "points_difference", "free_delivery_points", "free_delivery_refund", "refund_difference", "none",
]);

const POINTS_KINDS: ReadonlySet<DeliveryCompensationKind> = new Set(["points_difference", "free_delivery_points"]);
const REFUND_KINDS: ReadonlySet<DeliveryCompensationKind> = new Set(["free_delivery_refund", "refund_difference"]);

/**
 * What the CUSTOMER is told they received, from a stored move. Null when nothing was given — including
 * a points or refund kind whose amount came to zero. ⚠ The one mapping: the customer's order page and
 * the email both call it.
 */
export function customerCompensationOf(row: { compensation: string; amount_cents: number; points: number | null }): CustomerCompensationDTO | null {
  if (row.amount_cents <= 0) return null;
  const kind = row.compensation as DeliveryCompensationKind;
  if (POINTS_KINDS.has(kind) && (row.points ?? 0) > 0) return { kind: "points", amount: formatCents(row.amount_cents), points: row.points! };
  if (REFUND_KINDS.has(kind)) return { kind: "refund", amount: formatCents(row.amount_cents) };
  return null;
}

// ── Facts ───────────────────────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  stop_id: string;
  round_id: string;
  round_status: string;
  kind: "collection" | "delivery";
  state: "assigned" | "picked_up";
  driver_id: string;
}

export interface MoveFacts {
  orderId: string;
  status: string;
  paid: boolean;
  type: DeliveryType | null;
  updatedAt: string;
  customerId: string;
  postcode: string | null;
  paidCents: number;
  grams: number;
  basketCents: number;
  packages: { id: string; handed: boolean; delivered: boolean }[];
  assignments: Assignment[];
  /** A parcel of the order has left a supplier in a driver's van (at any time) — it can only go via the hub now. */
  collected: boolean;
  booking: { slot_id: string; delivery_date: string; window_start: Date; window_end: Date; state: string } | null;
  courier: {
    planReady: boolean;
    courierCents: number | null;
    serviceId: string | null;
    courierName: string | null;
    serviceName: string | null;
    estimate: string | null;
    collectionDefault: "hub" | "supplier";
  };
  centsPerPoint: number;
  refundableCents: number;
}

const cents = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100);

/**
 * Everything a preview and a move decide from — ONE read, so the preview a person confirms and the
 * move that checks it can never be computed two ways. Pass the move's transaction when moving (the
 * order row is locked FOR UPDATE).
 */
export async function loadMoveFacts(q: Queryable, orderId: string, opts: { lock?: boolean } = {}): Promise<MoveFacts | null> {
  const o = (
    await q.query<{
      id: string; status: string; delivery_type: DeliveryType | null; updated_at: Date; customer_id: string;
      delivery_address: Record<string, unknown> | null; fee: string | null; breakdown: { inputs?: { grams?: number; basketCents?: number } } | null;
      subtotal: string; discount: string | null; paid: boolean;
    }>(
      `SELECT o.id::text AS id, o.status, o.delivery_type, o.updated_at, o.customer_id::text AS customer_id, o.delivery_address,
              o.delivery_fee_amount::text AS fee, o.delivery_fee_breakdown AS breakdown,
              o.item_subtotal_amount::text AS subtotal, o.discount_amount::text AS discount,
              EXISTS (SELECT 1 FROM public.payment p WHERE p.order_id = o.id AND p.status = 'succeeded') AS paid
         FROM public."order" o
        WHERE o.id = $1${opts.lock ? " FOR UPDATE OF o" : ""}`,
      [orderId],
    )
  ).rows[0];
  if (!o) return null;

  const packages = (
    await q.query<{ id: string; handed: boolean; delivered: boolean }>(
      `SELECT sf.id::text AS id,
              EXISTS (SELECT 1 FROM public.carrier_handoff h WHERE h.shop_fulfillment_id = sf.id)
                OR EXISTS (SELECT 1 FROM public.courier_consignment c
                            WHERE c.shop_fulfillment_id = sf.id AND c.state NOT IN ('booked', 'cancelled')) AS handed,
              EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = sf.id) AS delivered
         FROM public.shop_fulfillment sf
        WHERE sf.order_id = $1 AND sf.status <> 'withdrawn'
        ORDER BY sf.id`,
      [orderId],
    )
  ).rows;

  const assignments = (
    await q.query<Assignment>(
      `SELECT rp.id::text AS id, rp.stop_id::text AS stop_id, dr.id::text AS round_id, dr.status AS round_status,
              dr.kind, rp.state, dr.driver_id::text AS driver_id
         FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id
         JOIN public.driver_round dr ON dr.id = rs.round_id
         JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
        WHERE sf.order_id = $1 AND rp.state IN ('assigned', 'picked_up') AND dr.status IN ('planned', 'in_progress')
        ORDER BY rp.id`,
      [orderId],
    )
  ).rows;
  // A collected parcel stays collected after its round ends: that it ever left the supplier is what matters.
  const collected = (
    await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id JOIN public.driver_round dr ON dr.id = rs.round_id
         JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
        WHERE sf.order_id = $1 AND dr.kind = 'collection' AND rp.state = 'picked_up'`,
      [orderId],
    )
  ).rows[0]!.n > 0;

  const booking = (
    await q.query<{ slot_id: string; delivery_date: string; window_start: Date; window_end: Date; state: string }>(
      `SELECT slot_id::text AS slot_id, delivery_date::text AS delivery_date, window_start, window_end, state
         FROM public.delivery_slot_booking WHERE order_id = $1`,
      [orderId],
    )
  ).rows[0] ?? null;

  const grams = Number(o.breakdown?.inputs?.grams ?? 0);
  const basketCents = Number(o.breakdown?.inputs?.basketCents ?? cents(o.subtotal) - cents(o.discount));

  let courierCents: number | null = null;
  let planReady = true;
  try {
    const plan = await loadActivePlan(q, "courier");
    courierCents = courierFee({ grams, basketCents, plan: courierValues(plan) }).totalCents;
  } catch (err) {
    if (!(err instanceof NoActivePlanError)) throw err;
    planReady = false;
  }
  const settings = await loadCourierSettings(q);
  const service = settings.defaultServiceId
    ? (
        await q.query<{ courier_name: string; service_name: string }>(
          `SELECT courier_name, service_name FROM public.courier_service WHERE id = $1`,
          [settings.defaultServiceId],
        )
      ).rows[0]
    : undefined;

  const points = await loadPointsSettings(q);
  const refundableCents = await createRefundRepository(q).remainingCents(orderId);
  const postcodeRaw = o.delivery_address?.postalCode;

  return {
    orderId: o.id,
    status: o.status,
    paid: o.paid && o.status === "paid",
    type: o.delivery_type,
    updatedAt: new Date(o.updated_at).toISOString(),
    customerId: o.customer_id,
    postcode: typeof postcodeRaw === "string" ? normalizePostcode(postcodeRaw) : null,
    paidCents: cents(o.fee),
    grams,
    basketCents,
    packages,
    assignments,
    collected,
    booking,
    courier: {
      planReady,
      courierCents,
      serviceId: settings.defaultServiceId,
      courierName: service?.courier_name ?? null,
      serviceName: service?.service_name ?? null,
      estimate: settings.estimateText,
      collectionDefault: settings.collectionDefault,
    },
    centsPerPoint: points.centsPerPoint,
    refundableCents,
  };
}

/** How a moved order's parcels reach the courier: via the hub once any has left a supplier. */
export const collectionFor = (f: MoveFacts): "hub" | "supplier" => (f.collected ? "hub" : f.courier.collectionDefault);

/**
 * Why a move may not happen, or null. ⚠ The order of the checks is the order a person can act on them.
 * The coverage check for a move back is async and done by the caller (`guardBackToEffy`).
 */
export function guardMove(f: MoveFacts, to: DeliveryType): DeliveryMoveRefusal | null {
  if (!f.paid) return "not_paid";
  if (f.type === null) return "no_delivery_type";
  if (to === "courier" && f.type === "courier") return "already_courier";
  if (to === "effy" && f.type === "effy") return "already_effy";
  if (f.packages.some((p) => p.delivered)) return "delivered";
  if (f.packages.some((p) => p.handed)) return "handed_over";
  if (to === "courier") {
    // ⚠ A delivery round under way is never touched (fleet's own rule): the parcel is in a van.
    if (f.assignments.some((a) => a.kind === "delivery" && a.state === "assigned" && a.round_status === "in_progress")) return "out_for_delivery";
    if (!f.courier.planReady || f.courier.serviceId === null || f.courier.courierCents === null) return "courier_not_ready";
  }
  return null;
}

async function guardBackToEffy(q: Queryable, f: MoveFacts, now: Date): Promise<DeliveryMoveRefusal | null> {
  const g = guardMove(f, "effy");
  if (g) return g;
  if (!f.postcode || (await coverageForPostcode(q, f.postcode, now)).kind !== "effy") return "not_in_area";
  return null;
}

// ── Windows for a move back ─────────────────────────────────────────────────────────────────────

/** The windows a customer could be sold now — the quote's calendar and rule, never a second one. */
async function windowsNow(q: Queryable, now: Date): Promise<DeliveryMoveWindowDTO[]> {
  const { runs, bufferMin } = await sameDaySchedule(q);
  const settings = await loadSlotSettings(q);
  const today = melbourneDate(now);
  const calendar = effyDays(now, settings.effyLookaheadDays, settings.noWeekdays, await nonDeliveryDates(q, today));
  const slots = await loadSlots(q);
  const load = await slotLoadByDate(q, calendar.map((d) => d.date));
  const days = openWindows(now, calendar, slots, load, runs, bufferMin, settings.turnaroundMin);
  return days.flatMap((d) =>
    d.windows.map((w) => ({
      slotId: w.id,
      date: d.date,
      start: w.start.toISOString(),
      end: w.end.toISOString(),
      label: formatArrival({ promisedFrom: null, promisedTo: null, windowStart: w.start.toISOString(), windowEnd: w.end.toISOString() }, now),
    })),
  );
}

// ── Preview ─────────────────────────────────────────────────────────────────────────────────────

function choicesOf(a: Amounts): DeliveryMoveChoiceDTO[] {
  const c = a.choices;
  return [
    { kind: "points_difference", amount: formatCents(c.points_difference.cents), points: c.points_difference.points!, default: true },
    { kind: "free_delivery_points", amount: formatCents(c.free_delivery_points.cents), points: c.free_delivery_points.points! },
    { kind: "free_delivery_refund", amount: formatCents(c.free_delivery_refund.cents) },
    { kind: "refund_difference", amount: formatCents(c.refund_difference.cents), lastResort: true },
    { kind: "none", amount: formatCents(0), noteRequired: true },
  ];
}

const amountsOf = (f: MoveFacts, to: DeliveryType): Amounts =>
  overrideAmounts({
    paidCents: f.paidCents,
    courierCents: to === "courier" ? f.courier.courierCents ?? 0 : null,
    centsPerPoint: f.centsPerPoint,
    refundableCents: f.refundableCents,
  });

function previewOf(f: MoveFacts, to: DeliveryType, refusal: DeliveryMoveRefusal | null, windows: DeliveryMoveWindowDTO[] | null): DeliveryMovePreviewDTO {
  const a = amountsOf(f, to);
  return {
    to,
    allowed: refusal === null,
    refusal: refusal ? { code: refusal, message: MOVE_REFUSAL_WORDS[refusal] } : null,
    updatedAt: f.updatedAt,
    paidDeliveryAmount: formatCents(f.paidCents),
    courierFeeAmount: to === "courier" && f.courier.courierCents !== null ? formatCents(f.courier.courierCents) : null,
    differenceAmount: a.differenceCents === null ? null : formatCents(a.differenceCents),
    refundableAmount: formatCents(f.refundableCents),
    centsPerPoint: f.centsPerPoint,
    choices: to === "courier" ? choicesOf(a) : [],
    courier:
      to === "courier" && f.courier.serviceId
        ? { courierName: f.courier.courierName ?? "", serviceName: f.courier.serviceName ?? "", estimate: f.courier.estimate ?? "", collection: collectionFor(f) }
        : null,
    windows,
  };
}

/** `GET …/delivery-move?to=` — what a move would do, and whether it may. */
export async function previewMove(q: Queryable, orderId: string, to: DeliveryType, now: Date = new Date()): Promise<DeliveryMovePreviewDTO> {
  const f = await loadMoveFacts(q, orderId);
  if (!f) throw new DeliveryMoveError("not_found");
  if (to === "courier") return previewOf(f, to, guardMove(f, to), null);
  const refusal = await guardBackToEffy(q, f, now);
  return previewOf(f, to, refusal, refusal ? [] : await windowsNow(q, now));
}

// ── The moves ───────────────────────────────────────────────────────────────────────────────────

export interface MoveResult {
  overrideId: string;
  orderId: string;
  /** Drivers whose work changed — read BEFORE the change; tell them after commit. */
  driverIds: string[];
  /** A refund recorded in the move's transaction and waiting to be sent (`submitRecorded`). */
  refundToSubmit: string | null;
  compensation: DeliveryCompensationKind;
}

const trimmed = (v: string | null | undefined, max = 500): string => (v ?? "").trim().slice(0, max);

/** The move itself, through 079's one writer; the id of the history row it wrote. */
async function recordedChange(tx: Queryable, orderId: string, actorSub: string, to: DeliveryType, courierEstimate: string | null, reason: string): Promise<string> {
  const written = await changeDeliveryType(tx, {
    orderId,
    actor: { kind: "staff", sub: actorSub },
    change: { to, reason: "staff_change", courierEstimate, note: trimmed(reason) },
  });
  // The guards ran under the same order lock, so the type cannot already be `to` here.
  if (!written) throw new Error("override: the delivery-type change was not recorded");
  return written.changeId;
}

/** Push + email to the customer, once per move. ⚠ Routing ids only; the worker words it at send. */
async function enqueueChanged(tx: Queryable, orderId: string, overrideId: string): Promise<void> {
  await tx.query(
    `INSERT INTO public.notification_request
         (recipient_sub, audience, type, channel, recipient_email, payload, dedupe_key)
     SELECT c.cognito_sub, 'customer', 'order_delivery_changed', ch.channel,
            CASE WHEN ch.channel = 'email' THEN c.email ELSE NULL END,
            jsonb_build_object('entityId', $2::text, 'deepLink', 'effy://order'),
            'order_delivery_changed:' || ch.channel || ':' || c.cognito_sub || ':' || $2::text
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
      CROSS JOIN (VALUES ('push'), ('email')) AS ch(channel)
      WHERE o.id = $1
        AND (ch.channel <> 'email' OR c.email IS NOT NULL)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [orderId, overrideId],
  );
}

export interface MoveToCourierInput {
  orderId: string;
  actorSub: string;
  reason: string;
  compensation: DeliveryCompensationKind;
  compensationNote?: string | null;
  expectedUpdatedAt: string;
  /** The chosen compensation's amount as previewed, in cents. */
  expectedAmountCents: number;
  now?: Date;
}

/** Move a paid Effy order to courier delivery, with the compensation staff chose — in `tx`. */
export async function moveToCourier(tx: Queryable, input: MoveToCourierInput): Promise<MoveResult> {
  const now = input.now ?? new Date();
  await tx.query(PLANNER_PASS_LOCK);
  const f = await loadMoveFacts(tx, input.orderId, { lock: true });
  if (!f) throw new DeliveryMoveError("not_found");
  const refusal = guardMove(f, "courier");
  if (refusal) throw new DeliveryMoveError(refusal);
  if (f.updatedAt !== new Date(input.expectedUpdatedAt).toISOString()) throw new DeliveryMoveError("changed");

  const amounts = amountsOf(f, "courier");
  const chosen = amounts.choices[input.compensation];
  if (chosen.cents !== input.expectedAmountCents) throw new DeliveryMoveError("compensation_changed", previewOf(f, "courier", null, null));

  const collection = collectionFor(f);
  const driverIds = new Set<string>();

  // Driver work. Delivery always goes (the courier delivers now); collection only when the courier
  // collects from the supplier — via the hub, the parcels still have to reach it.
  for (const a of f.assignments) {
    if (a.state !== "assigned") continue;
    if (a.kind === "delivery" || (a.kind === "collection" && collection === "supplier")) {
      await removeAssignment(tx, a);
      driverIds.add(a.driver_id);
    }
  }

  // The window place is given back; `released` stops counting at once (069).
  await tx.query(
    `UPDATE public.delivery_slot_booking SET state = 'released', held_until = NULL, updated_at = now()
      WHERE order_id = $1 AND state <> 'released'`,
    [input.orderId],
  );

  // How a courier package is stored (079): standard, no window, no day — routing, not a promise.
  await tx.query(
    `UPDATE public.order_package_delivery
        SET method = 'standard', slot_id = NULL, window_start = NULL, window_end = NULL, promised_from = NULL, promised_to = NULL
      WHERE order_id = $1`,
    [input.orderId],
  );
  await tx.query(
    `UPDATE public.shop_fulfillment SET delivery_method = 'standard', updated_at = now() WHERE order_id = $1 AND status <> 'withdrawn'`,
    [input.orderId],
  );

  await setCourierRouting(tx, input.orderId, { serviceId: f.courier.serviceId!, collection }, input.actorSub);
  const changeId = await recordedChange(tx, input.orderId, input.actorSub, "courier", f.courier.estimate ?? "", input.reason);
  const overrideId = (await tx.query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`)).rows[0]!.id;

  // The compensation, through the one writers.
  let pointsEntryId: string | null = null;
  let refundId: string | null = null;
  let refundToSubmit: string | null = null;
  if (POINTS_KINDS.has(input.compensation) && (chosen.points ?? 0) > 0) {
    pointsEntryId = (
      await credit(tx, {
        customerId: f.customerId, points: chosen.points!, kind: "auto_credit", reason: "courier_override_compensation",
        orderId: input.orderId, author: { kind: "staff", sub: input.actorSub },
        dedupeKey: `courier_override:${overrideId}`, quiet: true, now,
      })
    ).entryId;
  } else if (REFUND_KINDS.has(input.compensation) && chosen.cents > 0) {
    const rec = await recordRefundIn(tx, {
      orderId: input.orderId, kind: KIND_DELIVERY, amountCents: chosen.cents, currency: "AUD", reason: REASON_COURIER_OVERRIDE,
      note: trimmed(input.reason), idempotencyKey: `courier_override:${overrideId}`, actorKind: "back_office", actorSub: input.actorSub, lines: [],
    });
    refundId = rec.refundId;
    if (rec.issued && rec.split.cardCents > 0) refundToSubmit = rec.refundId;
  }

  const b = f.booking && f.booking.state !== "released" ? f.booking : null;
  await tx.query(
    `INSERT INTO public.delivery_override
         (id, change_id, order_id, to_type, slot_id, delivery_date, window_start, window_end, courier_service_id, collection,
          paid_delivery_cents, courier_fee_cents, difference_cents, compensation, amount_cents, points, points_entry_id, refund_id,
          compensation_note, actor_sub)
     VALUES ($1, $2, $3, 'courier', $4::uuid, $5::date, $6, $7, $8::uuid, $9, $10, $11, $12, $13, $14, $15, $16::uuid, $17::uuid, $18, $19)`,
    [
      overrideId, changeId, input.orderId, b?.slot_id ?? null, b?.delivery_date ?? null, b?.window_start ?? null, b?.window_end ?? null,
      f.courier.serviceId, collection, f.paidCents, f.courier.courierCents, amounts.differenceCents,
      input.compensation, POINTS_KINDS.has(input.compensation) || REFUND_KINDS.has(input.compensation) ? chosen.cents : 0,
      POINTS_KINDS.has(input.compensation) ? chosen.points ?? 0 : null, pointsEntryId, refundId,
      trimmed(input.compensationNote) || null,
      input.actorSub,
    ],
  );
  await enqueueChanged(tx, input.orderId, overrideId);

  return { overrideId, orderId: input.orderId, driverIds: [...driverIds], refundToSubmit, compensation: input.compensation };
}

export interface MoveToEffyInput {
  orderId: string;
  actorSub: string;
  reason: string;
  window: { slotId: string; date: string };
  expectedUpdatedAt: string;
  now?: Date;
}

/** Move a courier order back to Effy delivery, in a window it could be sold now — in `tx`. No money moves. */
export async function moveToEffy(tx: Queryable, input: MoveToEffyInput): Promise<MoveResult> {
  const now = input.now ?? new Date();
  await tx.query(PLANNER_PASS_LOCK);
  const f = await loadMoveFacts(tx, input.orderId, { lock: true });
  if (!f) throw new DeliveryMoveError("not_found");
  const refusal = await guardBackToEffy(tx, f, now);
  if (refusal) throw new DeliveryMoveError(refusal);
  if (f.updatedAt !== new Date(input.expectedUpdatedAt).toISOString()) throw new DeliveryMoveError("changed");

  // ⚠ THE ONE WINDOW RULE (078), under the slot's lock — the same lock two customers taking the last
  // place are serialised by. A day outside the calendar the customer would be offered is refused too.
  const settings = await loadSlotSettings(tx);
  const today = melbourneDate(now);
  const calendar = effyDays(now, settings.effyLookaheadDays, settings.noWeekdays, await nonDeliveryDates(tx, today));
  const day = calendar.find((d) => d.date === input.window.date && !d.nonDelivery);
  const slot = day ? await lockSlot(tx, input.window.slotId) : null;
  if (!day || !slot) throw new DeliveryMoveError("window_unavailable");
  const { runs, bufferMin } = await sameDaySchedule(tx);
  const load = await slotLoad(tx, day.date);
  const judged = judgeWindow(now, day.date, slot, load.get(slot.id) ?? 0, runs, bufferMin, settings.turnaroundMin);
  if (judged.verdict !== "open") throw new DeliveryMoveError("window_unavailable");
  const w = judged.slot;

  // One order holds one place (UNIQUE order_id): the released row moves to the new window.
  await tx.query(
    `INSERT INTO public.delivery_slot_booking (slot_id, delivery_date, order_id, state, held_until, window_start, window_end, over_capacity)
     VALUES ($1, $2::date, $3, 'confirmed', NULL, $4, $5, false)
     ON CONFLICT (order_id) DO UPDATE
        SET slot_id = EXCLUDED.slot_id, delivery_date = EXCLUDED.delivery_date, state = 'confirmed', held_until = NULL,
            window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end, over_capacity = false, updated_at = now()`,
    [w.id, w.date, input.orderId, w.start, w.end],
  );

  // How an Effy window is stored (078): today's is same-day, a later day's standard — with the window.
  const method = w.date === today ? "same_day" : "standard";
  await tx.query(
    `UPDATE public.order_package_delivery
        SET method = $2, slot_id = $3::uuid, window_start = $4, window_end = $5, promised_from = $6::date, promised_to = $6::date
      WHERE order_id = $1`,
    [input.orderId, method, w.id, w.start, w.end, w.date],
  );
  await tx.query(
    `UPDATE public.shop_fulfillment SET delivery_method = $2, updated_at = now() WHERE order_id = $1 AND status <> 'withdrawn'`,
    [input.orderId, method],
  );

  await setCourierRouting(tx, input.orderId, null, input.actorSub);
  const changeId = await recordedChange(tx, input.orderId, input.actorSub, "effy", null, input.reason);
  const overrideId = (
    await tx.query<{ id: string }>(
      `INSERT INTO public.delivery_override
           (change_id, order_id, to_type, slot_id, delivery_date, window_start, window_end, paid_delivery_cents, compensation, amount_cents, actor_sub)
       VALUES ($1, $2, 'effy', $3::uuid, $4::date, $5, $6, $7, 'none', 0, $8)
       RETURNING id::text AS id`,
      [changeId, input.orderId, w.id, w.date, w.start, w.end, f.paidCents, input.actorSub],
    )
  ).rows[0]!.id;
  await enqueueChanged(tx, input.orderId, overrideId);

  return { overrideId, orderId: input.orderId, driverIds: [], refundToSubmit: null, compensation: "none" };
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────

interface MoveRow {
  id: string; change_id: string; created_at: Date; to_type: DeliveryType; actor_sub: string; actor_name: string | null;
  delivery_date: string | null; window_start: Date | null; window_end: Date | null;
  courier_name: string | null; service_name: string | null; collection: "hub" | "supplier" | null;
  paid_delivery_cents: number; courier_fee_cents: number | null; difference_cents: number | null;
  compensation: DeliveryCompensationKind; amount_cents: number; points: number | null; refund_status: string | null;
  compensation_note: string | null;
}

/** Every move of an order, oldest first, as back-office reads it. ⚠ Staff only — it carries the reason and the fee. */
export async function deliveryMovesFor(q: Queryable, orderId: string): Promise<AdminDeliveryMoveDTO[]> {
  const rows = (
    await q.query<MoveRow>(
      `SELECT x.id::text AS id, x.change_id::text AS change_id, x.created_at, x.to_type, x.actor_sub,
              COALESCE(NULLIF(btrim(st.name), ''), st.email) AS actor_name,
              x.delivery_date::text AS delivery_date, x.window_start, x.window_end,
              s.courier_name, s.service_name, x.collection,
              x.paid_delivery_cents, x.courier_fee_cents, x.difference_cents,
              x.compensation, x.amount_cents, x.points, r.status AS refund_status, x.compensation_note
         FROM public.delivery_override x
         LEFT JOIN admin.staff st ON st.cognito_sub = x.actor_sub
         LEFT JOIN public.courier_service s ON s.id = x.courier_service_id
         LEFT JOIN public.refund r ON r.id = x.refund_id
        WHERE x.order_id = $1
        ORDER BY x.created_at, x.id`,
      [orderId],
    )
  ).rows;
  // The reason lives on the history row the move accompanies — read through its one module.
  const notes = await deliveryTypeChangeNotes(q, rows.map((r) => r.change_id));
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.created_at).toISOString(),
    to: r.to_type,
    reason: notes.get(r.change_id) ?? "",
    actor: { sub: r.actor_sub, name: r.actor_name ?? "a staff member" },
    window: r.delivery_date && r.window_start && r.window_end
      ? { date: r.delivery_date, start: new Date(r.window_start).toISOString(), end: new Date(r.window_end).toISOString() }
      : null,
    courier: r.courier_name && r.collection ? { courierName: r.courier_name, serviceName: r.service_name ?? "", collection: r.collection } : null,
    paidDeliveryAmount: formatCents(r.paid_delivery_cents),
    courierFeeAmount: r.courier_fee_cents === null ? null : formatCents(r.courier_fee_cents),
    differenceAmount: r.difference_cents === null ? null : formatCents(r.difference_cents),
    compensation: r.compensation,
    amount: formatCents(r.amount_cents),
    points: r.points,
    refundStatus: r.refund_status,
    compensationNote: r.compensation_note,
  }));
}

/**
 * The customer's view of the LATEST move, or null. ⚠ To, when, and what they received — never the
 * reason, the fee, the difference or the cost (SC-008).
 */
export async function latestMoveForCustomer(q: Queryable, orderId: string): Promise<OrderDeliveryMoveDTO | null> {
  const r = (
    await q.query<{ to_type: DeliveryType; created_at: Date; compensation: string; amount_cents: number; points: number | null }>(
      `SELECT to_type, created_at, compensation, amount_cents, points
         FROM public.delivery_override WHERE order_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [orderId],
    )
  ).rows[0];
  if (!r) return null;
  return { to: r.to_type, at: new Date(r.created_at).toISOString(), compensation: r.to_type === "courier" ? customerCompensationOf(r) : null };
}
