// A product's GST status and its history. One writer, `setGstStatus`, writes the column and its
// `product_gst_change` row in one statement. Paths: `create`, `direct` (a draft), `review`, `bulk`.
import type { GstStatus } from "@effy/shared-types";

type Tx = { query: (text: string, values?: unknown[]) => Promise<any> };

export type GstActor = { kind: "shop_staff"; sub: string } | { kind: "admin_staff"; sub: string };
export type GstVia = "create" | "review" | "direct" | "bulk";

export const isGstStatus = (v: unknown): v is GstStatus => v === "taxable" || v === "gst_free";

/** A repeat of the current status records nothing. */
export async function setGstStatus(tx: Tx, productId: string, to: GstStatus, actor: GstActor, via: GstVia): Promise<boolean> {
  const res = await tx.query(
    `WITH old AS (SELECT id, gst_status FROM public.product WHERE id = $1 FOR UPDATE),
          upd AS (UPDATE public.product p SET gst_status = $2
                    FROM old WHERE p.id = old.id AND old.gst_status IS DISTINCT FROM $2
                  RETURNING old.gst_status AS from_status)
     INSERT INTO public.product_gst_change (product_id, from_status, to_status, actor_kind, shop_staff_id, admin_sub, via)
     SELECT $1, upd.from_status, $2, $3,
            CASE WHEN $3 = 'shop_staff' THEN (SELECT ss.id FROM public.shop_staff ss WHERE ss.cognito_sub = $4) END,
            CASE WHEN $3 = 'admin_staff' THEN $4 END,
            $5
       FROM upd
     RETURNING id`,
    [productId, to, actor.kind, actor.sub, via],
  );
  return (res.rowCount ?? 0) > 0;
}
