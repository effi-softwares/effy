// How each bag was handed over at each step. One writer, called inside each hand-over's own
// transaction (`labels.guard.test.ts`). By any actor: drivers, shop staff, hub staff.

import type { HandoverMethod, ParcelHandover } from "@effy/shared-types";

export type HandoverStep = "pack" | "collect" | "courier_handover" | "shop_pickup" | "checkin" | "load" | "deliver" | "return";

export type HandoverActor =
  | { kind: "driver"; driverId: string }
  | { kind: "shop_staff"; staffId: string }
  | { kind: "admin_staff"; sub: string };

const METHODS: ReadonlySet<string> = new Set<HandoverMethod>(["scan", "typed", "manual"]);

export interface RecordHandoversInput {
  step: HandoverStep;
  actor: HandoverActor;
  /** Every driver step and a hub check-in have one. */
  roundId?: string | null;
  changeId: string;
  /** Anything malformed is skipped, never an error. */
  parcels: ReadonlyArray<Partial<ParcelHandover>> | undefined;
  /** Parcel id → package id for what this hand-over covers; a stray id is ignored. */
  allowed: ReadonlyMap<string, string>;
  /** On the device, if the client said. */
  deviceAt?: string | null;
}

/** One row per parcel; a retry (same changeId) records nothing new. */
export async function recordHandovers(tx: any, input: RecordHandoversInput): Promise<number> {
  if (input.allowed.size === 0) return 0;
  const wellFormed = (input.parcels ?? []).filter(
    (p): p is Partial<ParcelHandover> & { method: HandoverMethod } => typeof p?.method === "string" && METHODS.has(p.method),
  );
  const codes = [...new Set(wellFormed.filter((p) => typeof p.parcelCode === "string" && !p.parcelId).map((p) => (p.parcelCode as string).toUpperCase()))];
  const idOfCode = new Map<string, string>();
  if (codes.length > 0) {
    const res = await tx.query(
      `SELECT id, parcel_code FROM public.package_parcel WHERE parcel_code = ANY($1::text[]) AND id = ANY($2::uuid[])`,
      [codes, [...input.allowed.keys()]],
    );
    for (const r of res.rows as Array<{ id: string; parcel_code: string }>) idOfCode.set(r.parcel_code, r.id);
  }
  // A parcel listed twice keeps its first method.
  const byParcel = new Map<string, HandoverMethod>();
  for (const p of wellFormed) {
    const id = typeof p.parcelId === "string" ? p.parcelId : p.parcelCode ? idOfCode.get(p.parcelCode.toUpperCase()) : undefined;
    if (id && input.allowed.has(id) && !byParcel.has(id)) byParcel.set(id, p.method);
  }
  if (byParcel.size === 0) return 0;
  const ids = [...byParcel.keys()];
  const a = input.actor;
  const deviceAt = validInstant(input.deviceAt);
  const res = await tx.query(
    `INSERT INTO public.package_handover
            (shop_fulfillment_id, parcel_id, round_id, actor_kind, driver_id, shop_staff_id, admin_sub,
             step, handover_method, change_id, device_at)
     SELECT p.package_id, p.parcel_id, $1, $2, $3, $4, $5, $6, p.method, $7, $8
       FROM unnest($9::uuid[], $10::uuid[], $11::text[]) AS p(parcel_id, package_id, method)
     ON CONFLICT (change_id, parcel_id) DO NOTHING`,
    [
      input.roundId ?? null,
      a.kind,
      a.kind === "driver" ? a.driverId : null,
      a.kind === "shop_staff" ? a.staffId : null,
      a.kind === "admin_staff" ? a.sub : null,
      input.step,
      input.changeId,
      deviceAt,
      ids,
      ids.map((id) => input.allowed.get(id)!),
      ids.map((id) => byParcel.get(id)!),
    ],
  );
  return res.rowCount ?? 0;
}

/** null when missing or not a date. */
export function validInstant(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
