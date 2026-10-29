// An order's activity in back-office (104): ONE log over every record the platform keeps about an order —
// packing (`fulfillment_event`), each bag's hand-overs (`package_handover`), the carrier hand-off and arrival,
// the delivery type's history, back-office moves (`delivery_override`), courier collection changes, the
// consignment's steps, and refunds. A read-side projection: nothing here is stored as a timeline.
import { DELIVERY_TYPE_WORDS, REFUND_REASON_WORDS } from "@effy/shared-types";
import { activityFact, activityFactNumber, actionFallback, staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared";

const STATE_WORDS: Record<string, string> = {
  pending: "New",
  received: "Received by the shop",
  picking: "Picking started",
  ready_for_pickup: "Ready for pickup",
  collected: "Collected",
  delivered: "Delivered",
  unfulfillable: "Shop can't supply",
  withdrawn: "Cancelled",
};

const HANDOVER_WORDS: Record<string, string> = {
  pack: "Packed at the shop",
  collect: "Collected",
  courier_handover: "Handed to the courier",
  shop_pickup: "Collected from the shop",
  checkin: "Checked in at hub",
  load: "Loaded",
  deliver: "Delivered",
  return: "Returned to hub",
};

const METHOD_WORDS: Record<string, string> = { scan: "scanned", typed: "code typed", manual: "by hand" };

const CONSIGNMENT_WORDS: Record<string, string> = {
  booked: "Courier booked",
  handed_over: "Handed to the courier",
  in_transit: "In transit with the courier",
  delivered: "Delivered by the courier",
  failed: "Courier delivery failed",
  lost: "Lost by the courier",
  damaged: "Damaged in transit",
  returned: "Returned to sender",
  resolved: "Courier problem resolved",
  cancelled: "Courier booking cancelled",
};

const MODE_WORDS: Record<string, string> = { hub: "Via the hub", supplier: "Pickup from the supplier" };

const DELIVERY_REASON_WORDS: Record<string, string> = {
  in_coverage: "The address is in Effy's delivery area",
  out_of_coverage: "The address is outside Effy's delivery area",
  no_window: "No Effy delivery window was available",
  staff_change: "Changed by staff",
};

const COMPENSATION_WORDS: Record<string, string> = {
  points_difference: "Points for the difference",
  free_delivery_points: "Free delivery, as points",
  free_delivery_refund: "Free delivery, back to the card",
  refund_difference: "The difference, back to the card",
};

const REFUND_STATUS_WORDS: Record<string, string> = {
  submitting: "being sent",
  submitted: "sent — waiting for the bank",
  succeeded: "returned",
  failed: "failed",
  refused: "refused by the provider",
};

/** Every action's words, for search. */
const WORDS: Record<string, string> = {
  "fe.state_changed": Object.values(STATE_WORDS).join(" "),
  "fe.item_gathered": "Item picked",
  "fe.item_unavailable": "Item marked unavailable",
  "fe.item_restored": "Item restored",
  "fe.note_added": "Shop added an internal note",
  "fe.tags_changed": "Shop changed its tags",
  handoff: "Handed to carrier",
  "arrival.driver_proof": "Delivered by an Effy driver",
  "arrival.staff_recorded": "Arrival recorded by back-office",
  "arrival.carrier_signal": "Arrival reported by carrier",
  ...Object.fromEntries(Object.entries(HANDOVER_WORDS).map(([k, w]) => [`ph.${k}`, w])),
  ...Object.fromEntries(Object.entries(CONSIGNMENT_WORDS).map(([k, w]) => [`ce.${k}`, w])),
  "type.set": "Delivery type decided",
  "type.changed": "Delivery type changed",
  "move.courier": "Moved to courier delivery",
  "move.effy": "Moved back to Effy delivery",
  collection: "Courier collection changed",
  refund: "Refund",
};

const reasonWords = (reason: string | null) =>
  reason ? ((REFUND_REASON_WORDS as Record<string, string>)[reason] ?? reason) : null;
const money = (cents: number | null) => (cents === null ? null : `$${(cents / 100).toFixed(2)}`);
const typeWords = (t: string | null) => (t === "effy" || t === "courier" ? DELIVERY_TYPE_WORDS[t] : t);

function entry(r: ActivityRow) {
  const shop = activityFact(r, "shop");
  const note = activityFact(r, "note");
  const [source, sub] = r.action.split(".", 2) as [string, string | undefined];
  switch (source) {
    case "fe": {
      const item = activityFact(r, "item");
      const qty = activityFactNumber(r, "quantity");
      switch (sub) {
        case "state_changed": {
          const to = activityFact(r, "to") ?? "";
          return {
            title: STATE_WORDS[to] ?? `Package ${to}`,
            subject: shop,
            tone: to === "unfulfillable" || to === "withdrawn" ? ("problem" as const) : to === "ready_for_pickup" ? ("primary" as const) : ("default" as const),
          };
        }
        case "item_gathered":
          return { title: "Item picked", detail: [item, qty !== null ? `× ${qty}` : null, note].filter(Boolean).join(" ") || null, subject: shop };
        case "item_unavailable":
          return { title: "Item marked unavailable", detail: [item, note].filter(Boolean).join(" — ") || null, subject: shop, tone: "problem" as const };
        case "item_restored":
          return { title: "Item restored", detail: item, subject: shop };
        case "note_added":
          // Never the note's body: shop notes are the shop's.
          return { title: "Shop added an internal note", subject: shop };
        case "tags_changed":
          return { title: "Shop changed its tags", detail: note, subject: shop };
        default:
          return { title: actionFallback(sub ?? r.action), subject: shop };
      }
    }
    case "handoff": {
      const carrier = activityFact(r, "carrier");
      const ref = activityFact(r, "reference");
      return { title: carrier ? `Handed to ${carrier}` : "Handed to carrier", detail: [ref ? `Reference ${ref}` : null, note].filter(Boolean).join(" · ") || null, subject: shop, tone: "primary" as const };
    }
    case "arrival":
      return { title: WORDS[r.action] ?? "Arrived", detail: note, subject: shop, tone: "done" as const };
    case "ph": {
      const bag = activityFact(r, "bag");
      const method = activityFact(r, "method");
      return {
        title: HANDOVER_WORDS[sub ?? ""] ?? actionFallback(sub ?? r.action),
        detail: method ? (METHOD_WORDS[method] ?? method) : null,
        subject: [shop, bag ? `bag ${bag}` : null].filter(Boolean).join(" · ") || null,
        tone: sub === "deliver" ? ("done" as const) : ("primary" as const),
      };
    }
    case "ce":
      return {
        title: CONSIGNMENT_WORDS[sub ?? ""] ?? actionFallback(sub ?? r.action),
        detail: note,
        subject: shop,
        tone: ["failed", "lost", "damaged", "returned"].includes(sub ?? "") ? ("problem" as const) : sub === "delivered" ? ("done" as const) : ("default" as const),
      };
    case "type": {
      const from = activityFact(r, "from");
      const to = activityFact(r, "to");
      const reason = activityFact(r, "reason");
      return {
        title: from ? `${typeWords(from)} → ${typeWords(to)}` : `${typeWords(to)}`,
        detail: [reason ? (DELIVERY_REASON_WORDS[reason] ?? reason) : null, note].filter(Boolean).join(" — ") || null,
      };
    }
    case "move": {
      const comp = activityFact(r, "compensation");
      const points = activityFactNumber(r, "points");
      const amount = money(activityFactNumber(r, "amountCents"));
      const lines =
        sub === "courier"
          ? [
              `Paid ${money(activityFactNumber(r, "paidCents"))} · courier ${money(activityFactNumber(r, "courierCents"))} · difference ${money(activityFactNumber(r, "differenceCents"))}`,
              comp === "none" || !comp
                ? `Nothing given${activityFact(r, "compensationNote") ? ` — ${activityFact(r, "compensationNote")}` : ""}`
                : `${COMPENSATION_WORDS[comp] ?? comp}: ${points !== null ? `${points} points (${amount})` : amount}${
                    activityFact(r, "refundStatus") ? ` · refund ${REFUND_STATUS_WORDS[activityFact(r, "refundStatus")!] ?? activityFact(r, "refundStatus")}` : ""
                  }`,
            ]
          : ["No money moved"];
      return { title: WORDS[r.action] ?? "Moved", detail: lines.join(" · "), tone: "problem" as const };
    }
    case "collection":
      return {
        title: "Courier collection changed",
        detail: [`${MODE_WORDS[activityFact(r, "from") ?? ""] ?? "?"} → ${MODE_WORDS[activityFact(r, "to") ?? ""] ?? "?"}`, note].filter(Boolean).join(" — "),
      };
    case "refund": {
      const kind = activityFact(r, "refundKind");
      const status = activityFact(r, "status") ?? "";
      const what = kind === "cancellation" ? "Cancellation refund" : kind === "delivery" ? "Delivery refund" : "Refund";
      return {
        title: `${what} of $${activityFact(r, "amount") ?? "0.00"} ${REFUND_STATUS_WORDS[status] ?? status}`,
        detail: [reasonWords(activityFact(r, "reason")), note].filter(Boolean).join(" — ") || null,
        tone: status === "failed" || status === "refused" ? ("problem" as const) : ("primary" as const),
      };
    }
    default:
      return { title: actionFallback(r.action) };
  }
}

const SHOP_NAME = `(SELECT s.name FROM public.shop s WHERE s.id = sf.shop_id)`;

export function orderActivitySource(orderId: string): ActivitySource {
  return {
    sql: `
      WITH pkg AS (SELECT sf.id, sf.shop_id, ${SHOP_NAME} AS shop FROM public.shop_fulfillment sf WHERE sf.order_id = $1::uuid)
      SELECT 'fe:' || fe.id::text AS id, fe.occurred_at AS at, 'packing'::text AS kind, 'fe.' || fe.event_type AS action,
             ss.name AS actor,
             concat_ws(' ', pkg.shop, oi.product_name, fe.detail, fe.to_status) AS search_text,
             jsonb_build_object('shop', pkg.shop, 'to', fe.to_status, 'item', oi.product_name, 'quantity', fe.quantity,
                                'note', CASE WHEN fe.event_type = 'note_added' THEN NULL ELSE fe.detail END) AS facts
        FROM public.fulfillment_event fe
        JOIN pkg ON pkg.id = fe.shop_fulfillment_id
        LEFT JOIN public.order_item oi ON oi.id = fe.order_item_id
        LEFT JOIN public.shop_staff ss ON ss.id = fe.actor_staff_id
      UNION ALL
      SELECT 'ho:' || h.id::text, h.handed_over_at, 'courier', 'handoff',
             ${staffNameSql("h.recorded_by_sub")},
             concat_ws(' ', pkg.shop, h.carrier_name, h.reference, h.note),
             jsonb_build_object('shop', pkg.shop, 'carrier', h.carrier_name, 'reference', h.reference, 'note', h.note)
        FROM public.carrier_handoff h JOIN pkg ON pkg.id = h.shop_fulfillment_id
      UNION ALL
      SELECT 'pa:' || pa.id::text, pa.arrived_at, 'delivery', 'arrival.' || pa.source,
             CASE pa.source WHEN 'driver_proof' THEN 'Effy driver' WHEN 'carrier_signal' THEN 'Courier'
                  ELSE ${staffNameSql("pa.recorded_by_sub")} END,
             concat_ws(' ', pkg.shop, pa.note),
             jsonb_build_object('shop', pkg.shop, 'note', pa.note)
        FROM public.package_arrival pa JOIN pkg ON pkg.id = pa.shop_fulfillment_id
      UNION ALL
      SELECT 'ph:' || ph.id::text, ph.recorded_at, 'handover', 'ph.' || ph.step,
             CASE ph.actor_kind WHEN 'driver' THEN d.name WHEN 'shop_staff' THEN ss.name
                  ELSE ${staffNameSql("ph.admin_sub")} END,
             concat_ws(' ', pkg.shop, pp.parcel_code, d.name, ss.name),
             jsonb_build_object('shop', pkg.shop, 'bag', pp.parcel_code, 'method', ph.handover_method)
        FROM public.package_handover ph
        JOIN pkg ON pkg.id = ph.shop_fulfillment_id
        LEFT JOIN public.driver d ON d.id = ph.driver_id
        LEFT JOIN public.shop_staff ss ON ss.id = ph.shop_staff_id
        LEFT JOIN public.package_parcel pp ON pp.id = ph.parcel_id
      UNION ALL
      SELECT 'ce:' || ce.id::text, ce.created_at, 'courier', 'ce.' || ce.kind,
             CASE WHEN ce.actor_kind = 'shop'
                  THEN COALESCE((SELECT ss.name FROM public.shop_staff ss WHERE ss.cognito_sub = ce.actor_sub), 'Supplier')
                  ELSE ${staffNameSql("ce.actor_sub")} END,
             concat_ws(' ', pkg.shop, ce.note),
             jsonb_build_object('shop', pkg.shop, 'note', ce.note)
        FROM public.courier_consignment_event ce
        JOIN public.courier_consignment cc ON cc.id = ce.consignment_id
        JOIN pkg ON pkg.id = cc.shop_fulfillment_id
      UNION ALL
      SELECT 'dt:' || t.id::text, t.created_at, 'delivery', CASE WHEN t.from_type IS NULL THEN 'type.set' ELSE 'type.changed' END,
             CASE WHEN t.actor_kind = 'checkout' THEN 'Checkout' ELSE ${staffNameSql("t.actor_sub")} END,
             concat_ws(' ', t.note, t.reason),
             jsonb_build_object('from', t.from_type, 'to', t.to_type, 'reason', t.reason, 'note', t.note)
        FROM public.order_delivery_type_change t WHERE t.order_id = $1::uuid
      UNION ALL
      SELECT 'mv:' || m.id::text, m.created_at, 'delivery', 'move.' || m.to_type,
             ${staffNameSql("m.actor_sub")},
             m.compensation_note,
             jsonb_build_object('compensation', m.compensation, 'points', m.points, 'amountCents', m.amount_cents,
                                'paidCents', m.paid_delivery_cents, 'courierCents', m.courier_fee_cents,
                                'differenceCents', m.difference_cents, 'compensationNote', m.compensation_note,
                                'refundStatus', rf.status)
        FROM public.delivery_override m
        LEFT JOIN public.refund rf ON rf.id = m.refund_id
       WHERE m.order_id = $1::uuid
      UNION ALL
      SELECT 'cc:' || c.id::text, c.created_at, 'courier', 'collection',
             ${staffNameSql("c.actor_sub")},
             c.note,
             jsonb_build_object('from', c.from_mode, 'to', c.to_mode, 'note', c.note)
        FROM public.order_courier_collection_change c WHERE c.order_id = $1::uuid
      UNION ALL
      SELECT 'rf:' || r.id::text, r.created_at, 'refund', 'refund',
             CASE r.actor_kind WHEN 'customer' THEN 'Customer' WHEN 'system' THEN 'System'
                  WHEN 'shop' THEN COALESCE((SELECT ss.name FROM public.shop_staff ss WHERE ss.cognito_sub = r.actor_sub), 'Shop')
                  ELSE ${staffNameSql("r.actor_sub")} END,
             concat_ws(' ', r.reason, r.note, r.amount::text),
             jsonb_build_object('refundKind', r.kind, 'status', r.status, 'amount', r.amount::text, 'reason', r.reason, 'note', r.note)
        FROM public.refund r WHERE r.order_id = $1::uuid`,
    args: [orderId],
    actionWords: WORDS,
    entry,
  };
}
