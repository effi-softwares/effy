// Repository for shop-local sections (016, US5): raw SQL, shop-scoped. Every query is bound to the
// caller-resolved shop id (never client input). A duplicate section name in a shop → 409 conflict.
import { query, withTransaction } from "@effy/edge-shared";

import { ProductError } from "../products/types";
import type { ShopSection } from "./types";

interface SectionRow {
  id: string;
  name: string;
  display_order: number;
}

function map(row: SectionRow): ShopSection {
  return { id: row.id, name: row.name, displayOrder: row.display_order };
}

function asConflict(err: unknown, message: string): ProductError {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    return new ProductError("conflict", message);
  }
  throw err;
}

export async function listSections(shopId: string): Promise<ShopSection[]> {
  const res = await query<SectionRow>(
    `SELECT id, name, display_order FROM public.shop_section
      WHERE shop_id = $1 ORDER BY display_order, name`,
    [shopId],
  );
  return res.rows.map(map);
}

export async function createSection(
  shopId: string,
  name: string,
  displayOrder: number,
): Promise<ShopSection> {
  try {
    const res = await query<SectionRow>(
      `INSERT INTO public.shop_section (shop_id, name, display_order)
            VALUES ($1, $2, $3) RETURNING id, name, display_order`,
      [shopId, name, displayOrder],
    );
    return map(res.rows[0]!);
  } catch (err) {
    throw asConflict(err, "a section with this name already exists in this shop");
  }
}

export async function updateSection(
  shopId: string,
  id: string,
  patch: { name: string | null; displayOrder: number | null },
): Promise<ShopSection> {
  try {
    const res = await query<SectionRow>(
      `UPDATE public.shop_section
          SET name = COALESCE($3, name), display_order = COALESCE($4, display_order), updated_at = now()
        WHERE id = $1 AND shop_id = $2 RETURNING id, name, display_order`,
      [id, shopId, patch.name, patch.displayOrder],
    );
    const row = res.rows[0];
    if (!row) throw new ProductError("not_found", "section not found");
    return map(row);
  } catch (err) {
    throw asConflict(err, "a section with this name already exists in this shop");
  }
}

export async function deleteSection(shopId: string, id: string): Promise<boolean> {
  // ON DELETE CASCADE on product_section unassigns products automatically.
  const res = await query<{ id: string }>(
    `DELETE FROM public.shop_section WHERE id = $1 AND shop_id = $2 RETURNING id`,
    [id, shopId],
  );
  return (res.rowCount ?? 0) > 0;
}
