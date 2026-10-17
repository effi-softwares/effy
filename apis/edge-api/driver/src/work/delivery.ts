// Delivery drops, history and activity (063, US3).
//
// ⚠ HISTORY CARRIES REAL PROOF SINCE 064. This header used to say `proofCaptured` was always false
// and `HistoryDetailDTO.proof` always null "until Slice D" — correct when written, and 064 IS that
// slice. A comment asserting a limitation that no longer holds is the stale-claim shape 060 and 063
// both record, so it was corrected in the same change rather than left to be believed.

import { ANY_TIME_LABEL, formatDeliveryWindow, type DeliveryWindow } from "@effy/shared-types";
import { presignRead, query, withTransaction } from "@effy/edge-shared";
import type {
  ActivityItem,
  DeliveryDropDTO,
  HandoverPreference,
  DropStatusRequest,
  HistoryDetailDTO,
  HistoryStop,
  HistoryDTO,
} from "@effy/shared-types";

import { dropStatusOf } from "./drop-status";
import { EMPTY_SUMMARY, addSummaries, manifestsByPackage } from "./manifest";
import { packageCodes, packageItems, stopPackageIds, stopRoundTimes } from "./repository";
import { assertStopRoundOpen } from "./open";
import { assertDropLoaded } from "./sequence";
import { NotFoundError, ordered } from "./service";
import { runMapOf } from "./run-map";
import { roundStops } from "./repository";

/** GET /driver/v1/delivery/drops/{dropId} — one customer stop. */
export async function deliveryDrop(dropId: string, driverId: string): Promise<DeliveryDropDTO> {
  const res = await query<{
    stop_id: string;
    status: string;
    order_number: string;
    recipient_name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    postal_code: string | null;
    region: string | null;
    package_count: string;
    shop_count: string;
    delivery_note: string | null;
    delivery_handover: HandoverPreference | null;
    window_start: Date | null;
    window_end: Date | null;
    any_time: boolean;
    phone: string | null;
  }>(
    `SELECT rs.id                                   AS stop_id,
            rs.status                               AS status,
            o.order_number                          AS order_number,
            o.delivery_address ->> 'recipientName'  AS recipient_name,
            o.delivery_address ->> 'line1'          AS line1,
            o.delivery_address ->> 'line2'          AS line2,
            o.delivery_address ->> 'city'           AS city,
            o.delivery_address ->> 'postalCode'     AS postal_code,
            o.delivery_address ->> 'region'         AS region,
            o.delivery_address ->> 'phone'          AS phone,
            count(rp.id)::text                      AS package_count,
            count(DISTINCT sf.shop_id)::text        AS shop_count,
            o.delivery_note                         AS delivery_note,
            o.delivery_handover                     AS delivery_handover,
            -- 069 — the window the customer was sold. Read from the ORDER's own packages rather
            -- than through round_package: a late-joined package must not change the window.
            (SELECT min(opd.window_start) FROM public.order_package_delivery opd
              WHERE opd.order_id = o.id AND opd.window_start IS NOT NULL) AS window_start,
            (SELECT min(opd.window_end)   FROM public.order_package_delivery opd
              WHERE opd.order_id = o.id AND opd.window_start IS NOT NULL) AS window_end,
            -- 085 — sold a day with no time.
            EXISTS (SELECT 1 FROM public.order_package_delivery opd
                      JOIN public.delivery_slot ds ON ds.id = opd.slot_id
                     WHERE opd.order_id = o.id AND ds.any_time) AS any_time
       FROM public.round_stop rs
       JOIN public.driver_round dr ON dr.id = rs.round_id
       JOIN public."order"      o  ON o.id = rs.order_id
       LEFT JOIN public.round_package   rp ON rp.stop_id = rs.id
       LEFT JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
      WHERE rs.id = $1 AND dr.driver_id = $2 AND rs.kind = 'customer_drop'
      GROUP BY rs.id, rs.status, o.id, o.order_number, o.delivery_address, o.delivery_note, o.delivery_handover`,
    [dropId, driverId],
  );

  const r = res.rows[0];
  if (!r) throw new NotFoundError();

  // 065 — one manifest per physical package, in the stable order the app labels by position.
  const packageIds = await stopPackageIds(dropId, driverId);
  const [items, codes] = await Promise.all([packageItems(packageIds), packageCodes(packageIds)]);
  const manifests = manifestsByPackage(packageIds, items);

  const address = [r.line1, r.line2, r.city, r.region, r.postal_code]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(", ");

  return {
    dropId: r.stop_id,
    orderRef: r.order_number,
    customerName: r.recipient_name ?? "",
    addressFull: address,
    // The customer's own note, verbatim (066). ⚠ This line read `instructions: null` from 049 until
    // 066, under a comment saying nothing on the platform stored it and "whoever adds the field at
    // checkout unblocks this line". Checkout now asks; the order keeps the answer; NULL still means the
    // customer wrote nothing, and nothing is invented in its place.
    instructions: r.delivery_note,
    // How they asked for it to be handed over. A REQUEST the app states and leads the proof chooser
    // with — never a rule that removes a way of completing the drop (066 FR-020).
    handover: r.delivery_handover,
    // 069 — when the customer was told to expect it. Null for an order placed before 069: the app
    // then shows no window at all. ⚠ Instants only — "due" and "late" are the app's to derive from
    // these and its own clock, because they change while the screen is open.
    ...dropWindow(r.window_start, r.window_end, r.any_time),
    // ⚠ Every stored state reads back as itself. This used to collapse everything unrecognised to
    // "staged", which is how a drop that HAD started kept showing "Start this drop".
    status: dropStatusOf(r.status),
    // ⚠ ONE ENTRY PER PACKAGE (065). This used to be a single synthetic entry for the whole drop, so
    // a driver holding two bags saw one row and could not match the list to what was in their hands.
    packages: packageIds.map((id) => {
      const manifest = manifests.get(id);
      return {
        ref: r.order_number,
        packageCode: codes.get(id), // 089 — the code on this bag's label
        // ⚠ HOW MANY shops contributed, never WHICH. Hidden fulfilment is a product rule, not a UI
        // choice — a driver learning which shops served an order would leak it to the customer. A
        // package is one shop's portion, so this is 1; the drop-wide count is `packages.length`.
        fromShopCount: 1,
        items: manifest?.items ?? [],
        summary: manifest?.summary ?? { ...EMPTY_SUMMARY },
      };
    }),
    summary: addSummaries(packageIds.map((id) => manifests.get(id)?.summary ?? EMPTY_SUMMARY)),
    // 072 — the drop is readable before its round opens; every action on it is refused until then.
    opening: (await stopRoundTimes(dropId, driverId))?.opening ?? null,
    // 092 — the number the customer gave at checkout, so the driver can call from the door. ⚠ ONLY
    // WHILE THE DROP IS OPEN: once it is delivered or not delivered the driver has no reason to call,
    // and history never carries it.
    customerPhone: OPEN_DROP.has(r.status) ? (r.phone?.trim() || null) : null,
    // 093 — loaded with the van. Until then nothing on the drop can be done.
    loaded: r.status !== "pending",
  };
}

/** An open drop's states, in the only order it may move through them. */
const PROGRESS = ["pending", "out_for_delivery", "en_route", "arrived"];
const OPEN_DROP = new Set(PROGRESS);

/** POST /driver/v1/delivery/drops/{dropId}/status — progress a drop. */
export async function setDropStatus(
  dropId: string,
  driverId: string,
  body: DropStatusRequest,
): Promise<{ status: string }> {
  return withTransaction(async (tx: any) => {
    const owns = await tx.query(
      `SELECT rs.id, rs.status
         FROM public.round_stop rs
         JOIN public.driver_round dr ON dr.id = rs.round_id
        WHERE rs.id = $1 AND dr.driver_id = $2 AND rs.kind = 'customer_drop'
        FOR UPDATE OF rs`,
      [dropId, driverId],
    );
    if (owns.rowCount === 0) throw new NotFoundError();

    // ⚠ A FINISHED DROP IS NEVER MOVED BACKWARDS. This function used to write whatever it was given,
    // so a stale tap on a delivered drop would have reset it to `pending` — un-delivering a package
    // that had proof and an arrival row. It now answers with where the drop actually is.
    const current: string = owns.rows[0].status;
    if (current === "done" || current === "skipped") {
      return { status: current === "done" ? "delivered" : "failed" };
    }

    // 072 — THE CALL THAT STOPS A VAN LEAVING THREE HOURS EARLY. A 5–7 pm delivery is assigned, and
    // visible, from the moment it reaches the hub; "Start this drop" is refused until the window's
    // round opens.
    await assertStopRoundOpen(tx, dropId, driverId);

    // 093 — not before the van is loaded. Loading is the only writer of `out_for_delivery` (the
    // per-drop "Start this drop" is gone), so this route moves a loaded drop on and nothing else.
    await assertDropLoaded(tx, dropId, driverId);

    // ⚠ `delivered` is NOT reachable here: completing a drop requires proof (064). Nor is
    // `out_for_delivery` since 093: that is the van being loaded.
    const ALLOWED = new Set(["en_route", "arrived"]);
    if (!ALLOWED.has(body.to)) throw new NotFoundError();
    const next = body.to;

    // ⚠ NOR IS AN OPEN DROP. An offline replay of "Start this drop" can land after "I've arrived";
    // it answers with where the drop is and writes nothing.
    if (PROGRESS.indexOf(next) <= PROGRESS.indexOf(current)) {
      return { status: dropStatusOf(current) };
    }
    await tx.query(`UPDATE public.round_stop SET status = $2 WHERE id = $1`, [dropId, next]);
    await tx.query(
      `UPDATE public.driver_round SET status = 'in_progress', updated_at = now()
        WHERE id = (SELECT round_id FROM public.round_stop WHERE id = $1) AND status = 'planned'`,
      [dropId],
    );
    return { status: body.to };
  });
}

/** GET /driver/v1/history — what this driver has finished, by local day. */
export async function history(driverId: string): Promise<HistoryDTO> {
  const res = await query<{
    local_date: string;
    run_id: string;
    kind: string;
    completed_at: Date | null;
    stop_count: string;
    package_count: string;
    window_start: Date | null;
    window_end: Date | null;
  }>(
    `SELECT to_char(dr.updated_at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD') AS local_date,
            dr.id        AS run_id,
            dr.kind      AS kind,
            dr.updated_at AS completed_at,
            -- 092 rev 2 — a delivery run's window: the span its drops were sold (none for a collection).
            (SELECT min(opd.window_start) FROM public.round_stop rw JOIN public.order_package_delivery opd ON opd.order_id = rw.order_id
              WHERE rw.round_id = dr.id AND opd.window_start IS NOT NULL) AS window_start,
            (SELECT max(opd.window_end) FROM public.round_stop rw JOIN public.order_package_delivery opd ON opd.order_id = rw.order_id
              WHERE rw.round_id = dr.id AND opd.window_start IS NOT NULL) AS window_end,
            -- 092 rev 2 — shops or drops, not the hub: what a driver would count.
            (SELECT count(*) FROM public.round_stop rs WHERE rs.round_id = dr.id AND rs.kind <> 'hub_checkin')::text AS stop_count,
            (SELECT count(*) FROM public.round_package rp JOIN public.round_stop rs ON rs.id = rp.stop_id
              WHERE rs.round_id = dr.id)::text AS package_count
       FROM public.driver_round dr
      WHERE dr.driver_id = $1 AND dr.status = 'completed'
      ORDER BY dr.updated_at DESC
      LIMIT 200`,
    [driverId],
  );

  // ⚠ 064 — THE DROPS HALF, WHICH HAS ALWAYS BEEN AN EMPTY ARRAY. `HistoryDropRow.proofCaptured` has
  // existed on the contract since 049 and never had a value, because `drops` was hardcoded to `[]`
  // and nothing captured proof anyway. Both are true now, so the field finally means something: a
  // driver can look back at a delivery and see that it WAS evidenced — which is the whole point of
  // having captured it.
  const drops = await query<{
    local_date: string;
    drop_id: string;
    order_number: string;
    customer_suburb: string | null;
    completed_at: Date | null;
    proof_captured: boolean;
    street: string | null;
    proof_method: string | null;
    failure_reason: string | null;
  }>(
    // 092 rev 2 — a drop that CAME BACK is history too ("Returned · nobody home"), with its street and
    // how a delivered one was handed over.
    `SELECT to_char(x.at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD') AS local_date, x.*
       FROM (
         SELECT rs.id          AS drop_id,
                o.order_number AS order_number,
                o.delivery_address ->> 'city' AS customer_suburb,
                nullif(btrim(o.delivery_address ->> 'line1'), '') AS street,
                COALESCE(rs.completed_at, f.failed_at) AS completed_at,
                COALESCE(rs.completed_at, f.failed_at) AS at,
                (dp.id IS NOT NULL) AS proof_captured,
                dp.method AS proof_method,
                CASE WHEN rs.status = 'skipped' THEN f.reason END AS failure_reason
           FROM public.round_stop rs
           JOIN public.driver_round dr ON dr.id = rs.round_id
           JOIN public."order"      o  ON o.id = rs.order_id
           LEFT JOIN public.delivery_proof dp ON dp.stop_id = rs.id
           LEFT JOIN LATERAL (
             SELECT fa.reason, fa.failed_at FROM public.delivery_attempt_failure fa
              WHERE fa.stop_id = rs.id ORDER BY fa.failed_at DESC LIMIT 1
           ) f ON TRUE
          WHERE dr.driver_id = $1
            AND rs.kind = 'customer_drop'
            AND rs.status IN ('done', 'skipped')
       ) x
      WHERE x.at IS NOT NULL
      ORDER BY x.at DESC
      LIMIT 200`,
    [driverId],
  );

  // ⚠ THE DAYS ARE MERGED, NOT SORTED, AND THAT IS NOT A STYLE CHOICE.
  //
  // `one-ordering.guard.test.ts` forbids a raw `.sort(` anywhere in a file that produces an ordered
  // stop list, and it is deliberately blunt: 063 hardened it after a cleverer version failed to catch
  // its own negative proof, because "whatever the variable is called, sorting HERE is the thing that
  // drifts". A `.sort(` on history days would have been harmless and would still have tripped it —
  // correctly, since the guard cannot tell the two apart and should not try.
  //
  // It is also the better construction. Both queries already return newest-first, so merging their
  // date sequences yields the right order BY BUILDING IT, rather than by fixing it up afterwards.
  const runRows = res.rows;
  const dropRows = drops.rows;
  const orderedDates: string[] = [];
  let i = 0;
  let j = 0;
  while (i < runRows.length || j < dropRows.length) {
    const a = runRows[i]?.local_date;
    const b = dropRows[j]?.local_date;
    // Descending, so the LATER date comes first; `undefined` means that source is exhausted.
    const pick = b === undefined || (a !== undefined && a >= b) ? a! : b!;
    if (orderedDates[orderedDates.length - 1] !== pick) orderedDates.push(pick);
    if (a === pick) i += 1;
    if (b === pick) j += 1;
  }

  const byDay = new Map<string, HistoryDTO["days"][number]>();
  for (const date of orderedDates) byDay.set(date, { date, runs: [], drops: [] });

  for (const r of runRows) {
    byDay.get(r.local_date)!.runs.push({
      runId: r.run_id,
      type: r.kind === "collection" ? "collection" : "same_day_delivery",
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      stopCount: Number(r.stop_count),
      packageCount: Number(r.package_count),
      window: dropWindow(r.window_start, r.window_end).window,
    });
  }
  for (const d of dropRows) {
    byDay.get(d.local_date)!.drops.push({
      dropId: d.drop_id,
      orderRef: d.order_number,
      customerSuburb: d.customer_suburb ?? "",
      completedAt: d.completed_at!.toISOString(),
      proofCaptured: d.proof_captured,
      street: d.street,
      proofMethod: (d.proof_method as HistoryDTO["days"][number]["drops"][number]["proofMethod"]) ?? null,
      failureReason: (d.failure_reason as HistoryDTO["days"][number]["drops"][number]["failureReason"]) ?? null,
    });
  }

  return { days: [...byDay.values()] };
}

/** GET /driver/v1/history/{kind}/{id} — one finished item. */
export async function historyDetail(
  kind: string,
  id: string,
  driverId: string,
): Promise<HistoryDetailDTO> {
  if (kind === "run") return historyRun(id, driverId);
  const res = await query<{
    status: string;
    completed_at: Date | null;
    address: string | null;
    proof_method: "photo" | "signature" | "contactless" | null;
    proof_media_key: string | null;
    proof_note: string | null;
    proof_captured_at: Date | null;
    order_number: string | null;
    package_count: string;
    failure_reason: HistoryDetailDTO["failureReason"];
    failed_at: Date | null;
    window_start: Date | null;
    window_end: Date | null;
  }>(
    `SELECT rs.status, rs.completed_at,
            o.order_number,
            (SELECT min(opd.window_start) FROM public.order_package_delivery opd
              WHERE opd.order_id = o.id AND opd.window_start IS NOT NULL) AS window_start,
            (SELECT min(opd.window_end)   FROM public.order_package_delivery opd
              WHERE opd.order_id = o.id AND opd.window_start IS NOT NULL) AS window_end,
            (SELECT count(*) FROM public.round_package rp WHERE rp.stop_id = rs.id)::text AS package_count,
            f.reason AS failure_reason, f.failed_at,
            CASE WHEN rs.kind = 'customer_drop'
                 THEN concat_ws(', ', o.delivery_address ->> 'line1', o.delivery_address ->> 'city')
                 ELSE concat_ws(', ', s.address_line1, s.suburb) END AS address,
            dp.method      AS proof_method,
            dp.media_key   AS proof_media_key,
            dp.note        AS proof_note,
            dp.captured_at AS proof_captured_at
       FROM public.round_stop rs
       JOIN public.driver_round dr ON dr.id = rs.round_id
       LEFT JOIN public."order" o ON o.id = rs.order_id
       LEFT JOIN public.shop    s ON s.id = rs.shop_id
       LEFT JOIN public.delivery_proof dp ON dp.stop_id = rs.id
       LEFT JOIN LATERAL (
         SELECT fa.reason, fa.failed_at FROM public.delivery_attempt_failure fa
          WHERE fa.stop_id = rs.id ORDER BY fa.failed_at DESC LIMIT 1
       ) f ON TRUE
      WHERE rs.id = $1 AND dr.driver_id = $2`,
    [id, driverId],
  );
  const r = res.rows[0];
  if (!r) throw new NotFoundError();

  const at = r.completed_at ?? r.failed_at;
  return {
    timeline: at ? [{ status: r.status, at: at.toISOString() }] : [],
    proof: await renderProof(r),
    addressFull: r.address,
    packages: [],
    // 092 rev 2 — the order, how many packages, and why a drop came back.
    orderRef: r.order_number,
    packageCount: Number(r.package_count),
    window: dropWindow(r.window_start, r.window_end).window,
    failureReason: r.status === "skipped" ? (r.failure_reason ?? null) : null,
  };
}

/** 092 — a finished run: its stops in order and how each ended. Only the caller's own, completed rounds. */
async function historyRun(runId: string, driverId: string): Promise<HistoryDetailDTO> {
  const res = await query<{
    stop_id: string;
    seq: number | null;
    kind: string;
    status: string;
    completed_at: Date | null;
    shop_name: string | null;
    address: string | null;
    proof_method: "photo" | "signature" | "contactless" | null;
    failure_reason: HistoryStop["failureReason"];
    round_kind: string;
    window_start: Date | null;
    window_end: Date | null;
  }>(
    `SELECT rs.id AS stop_id, rs.seq, rs.kind, rs.status, rs.completed_at, dr.kind AS round_kind,
            -- 092 rev 2 — a delivery run's window: the span its drops were sold (none for a collection).
            (SELECT min(opd.window_start) FROM public.round_stop rw JOIN public.order_package_delivery opd ON opd.order_id = rw.order_id
              WHERE rw.round_id = dr.id AND opd.window_start IS NOT NULL) AS window_start,
            (SELECT max(opd.window_end) FROM public.round_stop rw JOIN public.order_package_delivery opd ON opd.order_id = rw.order_id
              WHERE rw.round_id = dr.id AND opd.window_start IS NOT NULL) AS window_end,
            (SELECT f.reason FROM public.delivery_attempt_failure f WHERE f.stop_id = rs.id ORDER BY f.failed_at DESC LIMIT 1) AS failure_reason,
            s.name AS shop_name,
            CASE WHEN rs.kind = 'customer_drop'
                 THEN concat_ws(', ', o.delivery_address ->> 'line1', o.delivery_address ->> 'city') END AS address,
            dp.method AS proof_method
       FROM public.driver_round dr
       JOIN public.round_stop rs ON rs.round_id = dr.id
       LEFT JOIN public."order" o ON o.id = rs.order_id
       LEFT JOIN public.shop    s ON s.id = rs.shop_id
       LEFT JOIN public.delivery_proof dp ON dp.stop_id = rs.id
      WHERE dr.id = $1 AND dr.driver_id = $2 AND dr.status = 'completed'
      ORDER BY rs.kind = 'hub_checkin', rs.seq NULLS LAST, rs.completed_at NULLS LAST`,
    [runId, driverId],
  );
  if (res.rows.length === 0) throw new NotFoundError();
  const stops: HistoryStop[] = res.rows.map((r, i) => ({
    stopId: r.stop_id,
    sequence: i + 1,
    kind: r.kind === "customer_drop" ? "drop" : r.kind === "hub_checkin" ? "hub" : "shop",
    title: r.kind === "hub_checkin" ? "Hub check-in" : r.kind === "customer_drop" ? (r.address || "Delivery") : (r.shop_name ?? "Shop"),
    status: r.status === "skipped" ? "skipped" : "done",
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    proofMethod: r.proof_method,
    failureReason: r.status === "skipped" ? r.failure_reason : null,
  }));
  // 092 rev 2 — the finished run's map, every stop done (the list's own order, from the shared rule).
  const map = await runMapOf(ordered(await roundStops(runId, driverId)), res.rows[0]!.round_kind === "collection" ? "collection" : "delivery", true);
  // The latest finish — a max, not a sort (one-ordering.guard.test.ts forbids `.sort(` in this file).
  const last = res.rows.map((r) => r.completed_at).filter((d): d is Date => d !== null)
    .reduce<Date | undefined>((a, b) => (a === undefined || b.getTime() > a.getTime() ? b : a), undefined);
  return {
    timeline: last ? [{ status: "completed", at: last.toISOString() }] : [],
    proof: null,
    addressFull: null,
    packages: [],
    stops,
    map,
    window: dropWindow(res.rows[0]!.window_start, res.rows[0]!.window_end).window,
  };
}

interface ProofColumns {
  proof_method: "photo" | "signature" | "contactless" | null;
  proof_media_key: string | null;
  proof_note: string | null;
  proof_captured_at: Date | null;
}

/**
 * Turn stored proof into something viewable (064, US5 — FR-023).
 *
 * ⚠ THERE IS NO EXPIRY LOGIC HERE, AND ITS ABSENCE IS THE DESIGN. Proof media is ARCHIVED, never
 * deleted (operator direction, research R5): a lifecycle rule moves it to Glacier Instant Retrieval
 * after 90 days, which serves through the ordinary S3 API in milliseconds. A presigned GET works the
 * same on a photograph from this morning and one from two years ago, so no read path has two
 * behaviours depending on an object's age — and an earlier draft's shared `proof-retention.ts`, its
 * derived "has this expired?" answer and the test keeping that derivation in step with the Terraform
 * number all ceased to exist with the decision.
 *
 * ⚠ WHICH INVERTS FR-026. Under time-limited retention a missing object was an expected state to
 * render politely. Nothing deletes media now, so `mediaUrl: null` where a `media_key` EXISTS means
 * something is wrong — a failed upload recorded anyway, a key mismatch, or an object removed out of
 * band. It is alarmed on, never dressed up as a tidy empty state: a system that renders its own
 * corruption as a normal outcome cannot report it.
 */
async function renderProof(r: ProofColumns): Promise<HistoryDetailDTO["proof"]> {
  if (r.proof_method === null || r.proof_captured_at === null) return null;

  let mediaUrl: string | null = null;
  if (r.proof_media_key !== null) {
    try {
      mediaUrl = await presignRead(r.proof_media_key);
    } catch (err) {
      // ⚠ EMF ON STDOUT AS ITS OWN RECORD — never a dimension on an existing metric, because a
      // dimensioned metric is a DIFFERENT metric in CloudWatch and an alarm on the undimensioned
      // name goes blind the moment one is added (059 found exactly this; 054 before it).
      console.log(
        JSON.stringify({
          _aws: {
            Timestamp: Date.now(),
            CloudWatchMetrics: [
              {
                Namespace: "Effy/Dispatch",
                Dimensions: [[]],
                Metrics: [{ Name: "ProofMediaMissingOnRead", Unit: "Count" }],
              },
            ],
          },
          ProofMediaMissingOnRead: 1,
        }),
      );
      mediaUrl = null;
    }
  }

  return {
    method: r.proof_method,
    // ⚠ Null here has TWO meanings and they are not the same fact:
    //   · the proof never had media — only possible for `contactless`, and since FR-002 requires a
    //     photograph for an unattended drop, only for rows written before that rule;
    //   · the object should exist and could not be read — the fault case above, which alarms.
    // They are distinguishable at the source (`media_key IS NULL` vs a key that will not resolve),
    // which is what FR-026 asks for.
    mediaUrl,
    note: r.proof_note,
    capturedAt: r.proof_captured_at.toISOString(),
  };
}

/**
 * GET /driver/v1/activity.
 *
 * ⚠ DERIVED FROM ROUNDS, NOT A STORED FEED. A notification table would be a second place the truth
 * about a driver's work lives, and the two would disagree the first time one write failed (027's
 * counted-not-stored rule). A round that changed under a driver IS the activity.
 */
export async function activity(driverId: string): Promise<ActivityItem[]> {
  const res = await query<{ id: string; changed_note: string | null; updated_at: Date; kind: string }>(
    `SELECT id, changed_note, updated_at, kind
       FROM public.driver_round
      WHERE driver_id = $1 AND changed_note IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 50`,
    [driverId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    type: "run_assigned",
    body: r.changed_note ?? "",
    createdAt: r.updated_at.toISOString(),
    // ⚠ Always false: there is nowhere to record a read receipt, and claiming otherwise would make
    // the badge lie. Slice D or a later slice adds the store if the feed proves worth keeping.
    read: false,
    runId: r.id,
    dropId: null,
  }));
}

/** A drop's window as the label the app shows and the instants it judges Due and Late by. */
function dropWindow(
  start: Date | null,
  end: Date | null,
  anyTime = false,
): { window: string | null; deliveryWindow: DeliveryWindow | null } {
  if (!start || !end) return { window: null, deliveryWindow: null };
  const deliveryWindow = { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
  // ⚠ The SERVER words the window, in Melbourne time, with the one shared formatter. The app has no
  // timezone database to do it with, and a second wording is how two screens disagree.
  // 085 — sold a day with no time: "Any time", with the round's hours so the driver knows the end.
  const hours = formatDeliveryWindow(deliveryWindow);
  return { window: anyTime ? `${ANY_TIME_LABEL} · ${hours}` : hours, deliveryWindow };
}
