// 096 US9 — back-office's GST status work (FR-092): the live products with none yet, and setting one
// status on many at once. Each change goes through the one writer (`setGstStatus`, via `bulk`), so
// every product's history says who classified it and how.
import { query, withTransaction } from "@effy/edge-shared";
import { isGstStatus, setGstStatus } from "@effy/edge-shared/documents";
import type { GstMissingDTO, GstStatus } from "@effy/shared-types";

import { ReviewError } from "../review/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BULK = 200;

/** Live (approved, not archived) products with no GST status, oldest first, with the total. */
export async function missing(limit = 200): Promise<GstMissingDTO> {
  const res = await query<{ id: string; name: string; shop_name: string; category_name: string; total: number }>(
    `SELECT p.id, p.name, s.name AS shop_name, c.name AS category_name, count(*) OVER ()::int AS total
       FROM public.product p
       JOIN public.shop s ON s.id = p.shop_id
       JOIN public.category c ON c.id = p.primary_category_id
      WHERE p.gst_status IS NULL AND p.approved_at IS NOT NULL AND p.status <> 'archived'
      ORDER BY p.approved_at, p.id
      LIMIT $1`,
    [limit],
  );
  return {
    total: Number(res.rows[0]?.total ?? 0),
    items: res.rows.map((r) => ({ productId: r.id, name: r.name, shopName: r.shop_name, categoryName: r.category_name })),
  };
}

/** Set [status] on every product in [productIds]; answers how many actually changed. */
export async function bulkSet(sub: string, productIds: unknown, status: unknown): Promise<{ changed: number }> {
  if (!isGstStatus(status)) throw new ReviewError("validation", "choose Taxable or GST-free", [{ field: "gstStatus", message: "taxable or gst_free" }]);
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.length > MAX_BULK || !productIds.every((id) => typeof id === "string" && UUID.test(id))) {
    throw new ReviewError("validation", `choose between 1 and ${MAX_BULK} products`, [{ field: "productIds", message: "product ids" }]);
  }
  const ids = [...new Set(productIds as string[])];
  return withTransaction(async (tx) => {
    const exists = await tx.query(`SELECT id FROM public.product WHERE id = ANY($1::uuid[])`, [ids]);
    if ((exists.rowCount ?? 0) !== ids.length) throw new ReviewError("not_found", "some of those products no longer exist — reload and try again");
    let changed = 0;
    for (const id of ids) if (await setGstStatus(tx, id, status as GstStatus, { kind: "admin_staff", sub }, "bulk")) changed += 1;
    return { changed };
  });
}
