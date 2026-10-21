// What a code, a label or an order number names (096) — the one resolver every surface's server uses.
//
// A bag's label carries `EFY1:<code>`; a person may type the bare code (any case, grouped for reading
// aloud) or an order number. Parcel 1's code is the package's 089 code, so an old package label resolves
// to its bag 1 by data.

import { readCode } from "@effy/shared-types";

export interface ResolvedParcel {
  kind: "parcel";
  parcelId: string;
  code: string;
  seq: number;
  zone: string;
  voided: boolean;
  packageId: string;
  shopId: string;
  orderId: string;
  orderNumber: string;
  /** The package was withdrawn (cancelled or refunded in full). */
  cancelled: boolean;
}

export interface ResolvedOrder {
  kind: "order";
  orderId: string;
  orderNumber: string;
}

const ORDER_NUMBER = /^EFY-[0-9A-Z]{4,12}$/;

/** Resolve a bag code or an order number, or null when nothing matches. */
export async function resolveCode(db: { query: (t: string, v?: unknown[]) => Promise<any> }, raw: string): Promise<ResolvedParcel | ResolvedOrder | null> {
  const code = readCode(raw, "typed");
  if (code) {
    const res = await db.query(
      `SELECT p.id, p.parcel_code, p.seq, p.zone, p.voided_at IS NOT NULL AS voided,
              sf.id AS package_id, sf.shop_id, sf.status AS package_status, o.id AS order_id, o.order_number
         FROM public.package_parcel p
         JOIN public.shop_fulfillment sf ON sf.id = p.shop_fulfillment_id
         JOIN public."order" o ON o.id = sf.order_id
        WHERE p.parcel_code = $1`,
      [code],
    );
    const r = res.rows[0];
    if (r) {
      return {
        kind: "parcel", parcelId: r.id, code: r.parcel_code, seq: Number(r.seq), zone: r.zone, voided: r.voided,
        packageId: r.package_id, shopId: r.shop_id, orderId: r.order_id, orderNumber: r.order_number,
        cancelled: r.package_status === "withdrawn",
      };
    }
  }
  const number = raw.trim().toUpperCase();
  if (ORDER_NUMBER.test(number)) {
    const res = await db.query(`SELECT id, order_number FROM public."order" WHERE order_number = $1`, [number]);
    const r = res.rows[0];
    if (r) return { kind: "order", orderId: r.id, orderNumber: r.order_number };
  }
  return null;
}
