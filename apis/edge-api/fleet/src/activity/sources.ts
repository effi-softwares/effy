// Driver and vehicle activity (104): staff changes from `admin.audit_log`, read through the activity helper.
import {
  activityFact,
  activityFactNumber,
  actionFallback,
  staffNameSql,
  type ActivityRow,
  type ActivitySource,
} from "@effy/edge-shared";

import { notFound } from "../shared/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireId(id: string, what: string): string {
  if (!UUID.test(id)) throw notFound(`${what} not found`);
  return id;
}

const changedList = (r: ActivityRow): string | null => {
  const changed = Array.isArray(r.facts?.changed) ? (r.facts.changed as unknown[]).filter((c) => typeof c === "string") : [];
  return changed.length > 0 ? `Changed: ${changed.join(", ")}` : null;
};

const valuesOf = (r: ActivityRow): Record<string, unknown> =>
  r.facts?.values && typeof r.facts.values === "object" ? (r.facts.values as Record<string, unknown>) : {};

// ---- driver -----------------------------------------------------------------------------------------

const DRIVER_WORDS: Record<string, string> = {
  "driver.created": "Added to the platform",
  "driver.updated": "Profile edited",
  "driver.status_changed": "Employment status changed",
  "driver.duty_session_ended": "Duty session ended by back-office",
  "driver.work_released": "Stranded work released",
  "driver.exception_resolved": "Report resolved",
  "driver.proof.viewed": "Proof of delivery opened",
  "driver.capability_granted": "Clearance given",
  "driver.capability_revoked": "Clearance taken away",
};

const DRIVER_KIND = `CASE
  WHEN a.action IN ('driver.created', 'driver.updated') THEN 'profile'
  WHEN a.action = 'driver.status_changed' THEN 'status'
  WHEN a.action LIKE 'driver.capability_%' THEN 'clearance'
  WHEN a.action = 'driver.proof.viewed' THEN 'proof'
  ELSE 'work' END`;

const FUNCTION_WORDS: Record<string, string> = { collection: "Collection", delivery: "Delivery" };

function driverEntry(r: ActivityRow) {
  const title = DRIVER_WORDS[r.action] ?? actionFallback(r.action);
  switch (r.action) {
    case "driver.created":
      return { title, detail: changedList(r), tone: "done" as const };
    case "driver.updated":
      return { title, detail: changedList(r) };
    case "driver.status_changed": {
      const v = valuesOf(r);
      const status = typeof v.status === "string" ? v.status : null;
      const reason = typeof v.reason === "string" ? v.reason : null;
      return {
        title,
        detail: [status ? `Now ${status}` : null, reason].filter(Boolean).join(" — ") || null,
        tone: status === "active" ? ("primary" as const) : ("problem" as const),
      };
    }
    case "driver.work_released": {
      const n = activityFactNumber(r, "packages");
      return { title, detail: [n !== null ? `${n} package${n === 1 ? "" : "s"}` : null, activityFact(r, "why")].filter(Boolean).join(" · ") || null };
    }
    case "driver.capability_granted": {
      const fn = activityFact(r, "function");
      const zone = activityFact(r, "zoneName") ?? (activityFact(r, "zoneId") === "every_zone" ? "Everywhere" : null);
      return { title, detail: [fn ? (FUNCTION_WORDS[fn] ?? fn) : null, zone].filter(Boolean).join(" · ") || null, tone: "primary" as const };
    }
    case "driver.capability_revoked":
      return { title, tone: "problem" as const };
    default:
      return { title };
  }
}

export function driverActivitySource(driverId: string): ActivitySource {
  return {
    sql: `
      SELECT a.id::text AS id, a.created_at AS at, ${DRIVER_KIND} AS kind, a.action,
             ${staffNameSql("a.actor_sub")} AS actor,
             concat_ws(' ', a.detail::text, z.name) AS search_text,
             a.detail || jsonb_build_object('zoneName', z.name) AS facts
        FROM admin.audit_log a
        LEFT JOIN public.delivery_zone z
          ON a.action = 'driver.capability_granted' AND z.id::text = a.detail->>'zoneId'
       WHERE a.target_type = 'driver' AND a.target_id = $1::uuid`,
    args: [requireId(driverId, "driver")],
    actionWords: DRIVER_WORDS,
    entry: driverEntry,
  };
}

// ---- vehicle ----------------------------------------------------------------------------------------

const VEHICLE_WORDS: Record<string, string> = {
  "vehicle.created": "Vehicle added",
  "vehicle.updated": "Vehicle details edited",
  "vehicle.status_changed": "Status changed",
  "vehicle.holding_issued": "Issued to a driver",
  "vehicle.holding_returned": "Returned",
  "vehicle.check_cleared": "Pre-shift check cleared",
};

const VEHICLE_KIND = `CASE
  WHEN a.action IN ('vehicle.created', 'vehicle.updated') THEN 'vehicle'
  WHEN a.action LIKE 'vehicle.holding_%' THEN 'holding'
  ELSE 'status' END`;

const km = (n: number | null) => (n === null ? null : `${n.toLocaleString("en-AU")} km`);

function vehicleEntry(r: ActivityRow) {
  const title = VEHICLE_WORDS[r.action] ?? actionFallback(r.action);
  const driver = activityFact(r, "driverName");
  const note = activityFact(r, "holdingNote");
  switch (r.action) {
    case "vehicle.created":
      return { title, detail: activityFact(r, "registrationPlate"), tone: "done" as const };
    case "vehicle.updated":
      return { title, detail: changedList(r) };
    case "vehicle.status_changed": {
      const status = activityFact(r, "status");
      return {
        title,
        detail: [status ? `Now ${status}` : null, activityFact(r, "reason")].filter(Boolean).join(" — ") || null,
        tone: status === "active" ? ("primary" as const) : ("problem" as const),
      };
    }
    case "vehicle.holding_issued":
      return {
        title: driver ? `Issued to ${driver}` : title,
        detail: [km(activityFactNumber(r, "odometerStartKm")), note].filter(Boolean).join(" · ") || null,
        tone: "primary" as const,
      };
    case "vehicle.holding_returned":
      return {
        title: driver ? `Returned by ${driver}` : title,
        detail: [km(activityFactNumber(r, "odometerEndKm")), note].filter(Boolean).join(" · ") || null,
      };
    case "vehicle.check_cleared":
      return { title, detail: activityFact(r, "note"), tone: "done" as const };
    default:
      return { title };
  }
}

/**
 * The vehicle's own changes, each holding's issue and return (named with the driver and the holding's note),
 * and its cleared pre-shift checks (audited against the check, so found through it).
 */
export function vehicleActivitySource(vehicleId: string): ActivitySource {
  return {
    sql: `
      SELECT a.id::text AS id, a.created_at AS at, ${VEHICLE_KIND} AS kind, a.action,
             ${staffNameSql("a.actor_sub")} AS actor,
             concat_ws(' ', a.detail::text, d.name, h.note) AS search_text,
             a.detail || jsonb_build_object('driverName', d.name, 'holdingNote', h.note) AS facts
        FROM admin.audit_log a
        LEFT JOIN public.vehicle_holding h
          ON a.action LIKE 'vehicle.holding_%' AND h.id::text = a.detail->>'holdingId'
        LEFT JOIN public.driver d ON d.id = h.driver_id
       WHERE (a.target_type = 'vehicle' AND a.target_id = $1::uuid)
          OR (a.target_type = 'vehicle_check'
              AND a.target_id IN (SELECT c.id FROM public.vehicle_check c WHERE c.vehicle_id = $1::uuid))`,
    args: [requireId(vehicleId, "vehicle")],
    actionWords: VEHICLE_WORDS,
    entry: vehicleEntry,
  };
}
