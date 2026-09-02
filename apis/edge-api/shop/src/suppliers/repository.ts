// Repository for shop suppliers (057, US6): raw SQL, shop-scoped. Every query is bound to the
// caller-resolved shop id (never client input), the same rule sections and products hold to — it is
// what makes cross-shop reads structurally impossible rather than merely unimplemented.
import { query } from "@effy/edge-shared";

import type { SupplierDTO, SupplierStatus } from "@effy/shared-types";

import { ProductError } from "../products/types";

interface SupplierRow {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: SupplierStatus;
  created_at: Date;
  updated_at: Date;
}

function map(row: SupplierRow): SupplierDTO {
  return {
    id: row.id,
    name: row.name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const COLUMNS = `id, name, contact_email, contact_phone, notes, status, created_at, updated_at`;

function asConflict(err: unknown, message: string): never {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    throw new ProductError("conflict", message);
  }
  throw err;
}

export async function listSuppliers(shopId: string): Promise<SupplierDTO[]> {
  const res = await query<SupplierRow>(
    `SELECT ${COLUMNS} FROM public.supplier
      WHERE shop_id = $1
      ORDER BY status, name`,
    [shopId],
  );
  return res.rows.map(map);
}

export async function getSupplier(shopId: string, id: string): Promise<SupplierDTO | null> {
  const res = await query<SupplierRow>(
    `SELECT ${COLUMNS} FROM public.supplier WHERE shop_id = $1 AND id = $2`,
    [shopId, id],
  );
  return res.rows[0] ? map(res.rows[0]) : null;
}

export async function createSupplier(
  shopId: string,
  input: { name: string; contactEmail: string | null; contactPhone: string | null; notes: string | null },
): Promise<SupplierDTO> {
  try {
    const res = await query<SupplierRow>(
      `INSERT INTO public.supplier (shop_id, name, contact_email, contact_phone, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [shopId, input.name, input.contactEmail, input.contactPhone, input.notes],
    );
    return map(res.rows[0]!);
  } catch (err) {
    asConflict(err, "a supplier with that name already exists");
  }
}

/**
 * ⚠ THE WRITE READS THE PRESENCE OF A KEY, NEVER ITS TRUTHINESS.
 *
 * 056 shipped exactly this defect: `COALESCE($n, col)` cannot tell "leave this alone" from "clear
 * this", so a field once set could never be emptied again. Here an ABSENT key means "leave alone" and
 * an explicit `null` means "clear it" — which is only expressible by building the SET list from the
 * keys the caller actually sent.
 */
export async function updateSupplier(
  shopId: string,
  id: string,
  patch: Partial<Record<"name" | "contactEmail" | "contactPhone" | "notes" | "status", unknown>>,
): Promise<SupplierDTO> {
  const sets: string[] = [];
  const args: unknown[] = [shopId, id];
  const column: Record<string, string> = {
    name: "name",
    contactEmail: "contact_email",
    contactPhone: "contact_phone",
    notes: "notes",
    status: "status",
  };

  for (const key of Object.keys(column)) {
    if (!(key in patch)) continue;
    args.push(patch[key as keyof typeof patch] ?? null);
    sets.push(`${column[key]} = $${args.length}`);
  }

  if (sets.length === 0) {
    const current = await getSupplier(shopId, id);
    if (!current) throw new ProductError("not_found", "supplier not found");
    return current;
  }

  try {
    const res = await query<SupplierRow>(
      `UPDATE public.supplier
          SET ${sets.join(", ")}, updated_at = now()
        WHERE shop_id = $1 AND id = $2
        RETURNING ${COLUMNS}`,
      args,
    );
    if (!res.rows[0]) throw new ProductError("not_found", "supplier not found");
    return map(res.rows[0]);
  } catch (err) {
    if (err instanceof ProductError) throw err;
    asConflict(err, "a supplier with that name already exists");
  }
}

/**
 * Archive a supplier.
 *
 * ⚠ IT IS NEVER A HARD DELETE, AND THE FK IS WHY. `purchase_order.supplier_id` is `ON DELETE
 * RESTRICT` — a supplier that has ever been ordered from cannot be removed without erasing the order
 * that names it. Archiving keeps the history readable and takes the supplier out of the picker, which
 * is the only thing the operator actually wanted.
 */
export async function archiveSupplier(shopId: string, id: string): Promise<void> {
  const res = await query(
    `UPDATE public.supplier SET status = 'archived', updated_at = now()
      WHERE shop_id = $1 AND id = $2`,
    [shopId, id],
  );
  if ((res.rowCount ?? 0) === 0) throw new ProductError("not_found", "supplier not found");
}

/**
 * Assign (or clear) a product's default supplier.
 *
 * ⚠ Both ids are checked against the caller's own shop in ONE statement. Verifying them separately
 * would let a caller pair their own product with another shop's supplier in the window between the
 * two reads — and the FK alone would happily accept it.
 */
export async function assignProductSupplier(
  shopId: string,
  productId: string,
  supplierId: string | null,
): Promise<void> {
  const res = await query(
    `UPDATE public.product p
        SET supplier_id = $3, updated_at = now()
      WHERE p.id = $2
        AND p.shop_id = $1
        AND ($3::uuid IS NULL
             OR EXISTS (SELECT 1 FROM public.supplier s
                         WHERE s.id = $3::uuid AND s.shop_id = $1 AND s.status = 'active'))`,
    [shopId, productId, supplierId],
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new ProductError("not_found", "product or supplier not found for this shop");
  }
}
