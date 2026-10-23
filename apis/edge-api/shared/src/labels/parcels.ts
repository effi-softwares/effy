// What a step still needs: every driver step and the hub station call `expectedParcels` then
// `accountFor` (`labels.guard.test.ts`). A request leaving a live bag neither handed over nor declared
// missing is refused (409 `parcels_unaccounted`).

import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { ParcelDTO, ParcelHandover, ParcelMissing, ParcelMissingReason, ParcelZone } from "@effy/shared-types";

import { problem } from "../lib/http";
import type { RequestScope } from "../lib/http";
import { emitMetric, metricNamespace } from "../lib/metrics";
import type { HandoverStep } from "./handovers";

type Db = { query: (text: string, values?: unknown[]) => Promise<any> };

/** The wire parcel plus its package. */
export interface StepParcel extends ParcelDTO {
  packageId: string;
}

const PARCEL_COLUMNS = `
  p.id AS parcel_id, p.parcel_code, p.seq, p.zone, p.shop_fulfillment_id AS package_id,
  count(*) OVER (PARTITION BY p.shop_fulfillment_id)::int AS of`;

function toParcel(r: any): StepParcel {
  return { parcelId: r.parcel_id, code: r.parcel_code, seq: Number(r.seq), of: Number(r.of), zone: r.zone as ParcelZone, packageId: r.package_id };
}

/** In package then bag order. */
export async function liveParcels(db: Db, packageIds: readonly string[]): Promise<StepParcel[]> {
  if (packageIds.length === 0) return [];
  const res = await db.query(
    `SELECT ${PARCEL_COLUMNS}
       FROM public.package_parcel p
      WHERE p.shop_fulfillment_id = ANY($1::uuid[]) AND p.voided_at IS NULL
      ORDER BY p.shop_fulfillment_id, p.seq`,
    [packageIds],
  );
  return res.rows.map(toParcel);
}

/** Grouped by package. */
export async function liveParcelsByPackage(db: Db, packageIds: readonly string[]): Promise<Map<string, ParcelDTO[]>> {
  const out = new Map<string, ParcelDTO[]>();
  for (const p of await liveParcels(db, packageIds)) {
    const { packageId, ...dto } = p;
    out.set(packageId, [...(out.get(packageId) ?? []), dto]);
  }
  return out;
}

/** SQL: bag `parcelId` or its whole package `packageId` is held (open, or resolved lost). */
export function parcelHeldSql(parcelId: string, packageId: string): string {
  return `EXISTS (SELECT 1 FROM public.package_hold ph
                   WHERE ph.shop_fulfillment_id = ${packageId}
                     AND (ph.parcel_id IS NULL OR ph.parcel_id = ${parcelId})
                     AND (ph.resolution IS NULL OR ph.resolution = 'lost'))`;
}

export interface ExpectedScope {
  step: HandoverStep;
  packageIds: readonly string[];
  /** A bag already handed over at this step on this round is not expected again; on a later round it is. */
  roundId: string | null;
}

/** Not voided, not held, not yet handed over at this step on this round. A bag resolved found is expected again. */
export async function expectedParcels(db: Db, scope: ExpectedScope): Promise<StepParcel[]> {
  if (scope.packageIds.length === 0) return [];
  const res = await db.query(
    `SELECT *
       FROM (SELECT ${PARCEL_COLUMNS}
               FROM public.package_parcel p
              WHERE p.shop_fulfillment_id = ANY($1::uuid[]) AND p.voided_at IS NULL) p
      WHERE NOT ${parcelHeldSql("p.parcel_id", "p.package_id")}
        AND NOT EXISTS (SELECT 1 FROM public.package_handover h
                         WHERE h.parcel_id = p.parcel_id AND h.step = $2
                           AND ($3::uuid IS NULL OR h.round_id = $3::uuid))
      ORDER BY p.package_id, p.seq`,
    [scope.packageIds, scope.step, scope.roundId],
  );
  return res.rows.map(toParcel);
}

/** Where each reason may be said, as the check `package_hold_reason_step`. */
export const MISSING_REASONS_BY_STEP: Readonly<Record<string, ReadonlySet<ParcelMissingReason>>> = {
  collect: new Set(["not_at_shop", "damaged", "wrong_temperature", "other"]),
  checkin: new Set(["not_in_van"]),
  load: new Set(["not_at_hub", "damaged", "wrong_temperature", "other"]),
  deliver: new Set(["not_in_van", "damaged", "wrong_temperature", "other"]),
  return: new Set(["not_in_van", "damaged", "wrong_temperature", "other"]),
};

export class ParcelsUnaccounted extends Error {
  constructor(
    readonly step: HandoverStep,
    readonly parcels: ReadonlyArray<Pick<ParcelDTO, "code" | "seq" | "of">>,
  ) {
    super(`${parcels.length} bag${parcels.length === 1 ? "" : "s"} not scanned or marked missing`);
    this.name = "ParcelsUnaccounted";
  }

  /** The 409 body every route sends. */
  body(): { type: "parcels_unaccounted"; detail: string; parcels: Array<{ code: string; seq: number; of: number }> } {
    return { type: "parcels_unaccounted", detail: this.message, parcels: this.parcels.map((p) => ({ code: p.code, seq: p.seq, of: p.of })) };
  }
}

/** Every bag declared missing: nothing can be handed over (use "Can't deliver"). */
export class NothingToHandOver extends Error {
  constructor() {
    super("Every bag is marked missing, so nothing can be handed over. Use Can't deliver instead.");
    this.name = "NothingToHandOver";
  }
}

export interface Accounted {
  /** By parcel id, with how. */
  handed: Array<{ parcel: StepParcel; method: ParcelHandover["method"] }>;
  /** With a reason valid at this step. */
  missing: Array<{ parcel: StepParcel; reason: ParcelMissingReason; note: string | null }>;
}

/** Throws `ParcelsUnaccounted` (emitting `ParcelsUnaccounted{step}`) when an expected bag is unaccounted. Unexpected bags are ignored. */
export function accountFor(
  step: HandoverStep,
  expected: readonly StepParcel[],
  parcels: ReadonlyArray<Partial<ParcelHandover>> | undefined,
  missing: ReadonlyArray<Partial<ParcelMissing>> | undefined,
): Accounted {
  const byId = new Map(expected.map((p) => [p.parcelId, p]));
  const byCode = new Map(expected.map((p) => [p.code, p]));
  const find = (r: { parcelId?: string; parcelCode?: string }) =>
    (typeof r.parcelId === "string" ? byId.get(r.parcelId) : undefined) ??
    (typeof r.parcelCode === "string" ? byCode.get(r.parcelCode.toUpperCase()) : undefined);

  const done = new Set<string>();
  const handed: Accounted["handed"] = [];
  for (const h of parcels ?? []) {
    const p = find(h);
    if (!p || done.has(p.parcelId) || (h.method !== "scan" && h.method !== "typed" && h.method !== "manual")) continue;
    done.add(p.parcelId);
    handed.push({ parcel: p, method: h.method });
  }
  const allowed = MISSING_REASONS_BY_STEP[step] ?? new Set();
  const declared: Accounted["missing"] = [];
  for (const m of missing ?? []) {
    const p = find(m);
    if (!p || done.has(p.parcelId) || !m.reason || !allowed.has(m.reason)) continue;
    const note = typeof m.note === "string" && m.note.trim() !== "" ? m.note.trim().slice(0, 500) : null;
    if (m.reason === "other" && note === null) continue;
    done.add(p.parcelId);
    declared.push({ parcel: p, reason: m.reason, note });
  }
  const unaccounted = expected.filter((p) => !done.has(p.parcelId));
  if (unaccounted.length > 0) {
    emitMetric(metricNamespace(), "ParcelsUnaccounted", unaccounted.length, { step });
    throw new ParcelsUnaccounted(step, unaccounted);
  }
  return { handed, missing: declared };
}

/** Holds per missing bag; when every expected bag of a package is missing, the package is held (parcel_id null). Returns those package ids. */
export async function writeParcelHolds(
  tx: Db,
  input: {
    step: "collect" | "checkin" | "load" | "deliver" | "return";
    driverId: string;
    roundId: string;
    changeId: string;
    missing: Accounted["missing"];
    /** Bags of each package this step expected, to tell some from all. */
    expectedCount: ReadonlyMap<string, number>;
  },
): Promise<{ parcelsHeld: number; packagesHeld: string[] }> {
  const perPackage = new Map<string, Accounted["missing"]>();
  for (const m of input.missing) perPackage.set(m.parcel.packageId, [...(perPackage.get(m.parcel.packageId) ?? []), m]);
  let parcelsHeld = 0;
  const packagesHeld: string[] = [];
  for (const [packageId, list] of perPackage) {
    const whole = list.length >= (input.expectedCount.get(packageId) ?? Infinity);
    if (whole) {
      const first = list[0]!;
      await tx.query(
        `INSERT INTO public.package_hold (shop_fulfillment_id, parcel_id, step, reason, note, driver_id, round_id, change_id)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [packageId, input.step, first.reason, first.note, input.driverId, input.roundId, input.changeId],
      );
      packagesHeld.push(packageId);
      parcelsHeld += list.length;
      continue;
    }
    for (const m of list) {
      const ins = await tx.query(
        `INSERT INTO public.package_hold (shop_fulfillment_id, parcel_id, step, reason, note, driver_id, round_id, change_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [packageId, m.parcel.parcelId, input.step, m.reason, m.note, input.driverId, input.roundId, input.changeId],
      );
      parcelsHeld += ins.rowCount ?? 0;
    }
  }
  return { parcelsHeld, packagesHeld };
}

/** Per package: "every bag this step expected". */
export function countByPackage(parcels: readonly StepParcel[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of parcels) out.set(p.packageId, (out.get(p.packageId) ?? 0) + 1);
  return out;
}

/**
 * Gives each package without one its bag 1, carrying the package's code, in the coldest zone of its
 * lines. Called by payment finalisation (the one `shop_fulfillment` writer). Idempotent.
 */
export async function createFirstParcels(tx: Db, scope: { orderId: string } | { packageIds: readonly string[] }): Promise<number> {
  const res = await tx.query(
    `INSERT INTO public.package_parcel (shop_fulfillment_id, parcel_code, seq, zone)
     SELECT sf.id, sf.package_code, 1, public.package_coldest_zone(sf.id)
       FROM public.shop_fulfillment sf
      WHERE ${"orderId" in scope ? "sf.order_id = $1" : "sf.id = ANY($1::uuid[])"}
        AND NOT EXISTS (SELECT 1 FROM public.package_parcel p WHERE p.shop_fulfillment_id = sf.id)`,
    ["orderId" in scope ? scope.orderId : scope.packageIds],
  );
  return res.rowCount ?? 0;
}

/** The sentence as `detail` (like `round_not_open` and the sequence gates) and the bags by code. */
export function parcelsUnaccountedProblem(err: ParcelsUnaccounted, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  const res = problem(409, "parcels_unaccounted", "Bags not accounted for", err.message, scope);
  const body = { ...JSON.parse(String(res.body)), parcels: err.body().parcels };
  return { ...res, body: JSON.stringify(body) };
}
