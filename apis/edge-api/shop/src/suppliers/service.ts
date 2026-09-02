// Service for shop suppliers (057, US6): validation + orchestration. No HTTP, no SQL. Reuses
// ProductError so the shop handler maps every domain error uniformly (the sections precedent).
import type { SupplierDTO, SupplierStatus } from "@effy/shared-types";

import { ProductError } from "../products/types";
import * as repo from "./repository";

const STATUSES: readonly SupplierStatus[] = ["active", "archived"];

function requiredName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    throw new ProductError("validation", "invalid supplier", [
      { field: "name", message: "must be a non-empty string" },
    ]);
  }
  if (name.length > 200) {
    throw new ProductError("validation", "invalid supplier", [
      { field: "name", message: "must be 200 characters or fewer" },
    ]);
  }
  return name;
}

/** Trim to null: an empty string and an absent value mean the same thing for an optional field. */
function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function listSuppliers(shopId: string): Promise<SupplierDTO[]> {
  return repo.listSuppliers(shopId);
}

export async function getSupplier(shopId: string, id: string): Promise<SupplierDTO> {
  const found = await repo.getSupplier(shopId, id);
  if (!found) throw new ProductError("not_found", "supplier not found");
  return found;
}

// ⚠ `async` even though nothing is awaited before the repo call, and that is deliberate. These
// functions VALIDATE first and validation throws — in a plain function returning a Promise, that throw
// is SYNCHRONOUS, so `service.createSupplier(x).catch(...)` would not catch it while
// `try { await service.createSupplier(x) } catch` would. One contract, always a rejected promise.
export async function createSupplier(
  shopId: string,
  body: Record<string, unknown>,
): Promise<SupplierDTO> {
  return repo.createSupplier(shopId, {
    name: requiredName(body.name),
    contactEmail: optionalText(body.contactEmail),
    contactPhone: optionalText(body.contactPhone),
    notes: optionalText(body.notes),
  });
}

/**
 * ⚠ THE PATCH IS BUILT FROM THE KEYS THE CALLER SENT, not from every field. That is what lets a
 * contact email be CLEARED (`contactEmail: null`) as distinct from LEFT ALONE (key absent) — the
 * distinction 056 lost by reaching for COALESCE.
 */
export async function updateSupplier(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<SupplierDTO> {
  const patch: Record<string, unknown> = {};

  if ("name" in body) patch.name = requiredName(body.name);
  for (const key of ["contactEmail", "contactPhone", "notes"] as const) {
    if (key in body) patch[key] = optionalText(body[key]);
  }
  if ("status" in body) {
    const status = body.status;
    if (typeof status !== "string" || !STATUSES.includes(status as SupplierStatus)) {
      throw new ProductError("validation", "invalid supplier", [
        { field: "status", message: `must be one of ${STATUSES.join(", ")}` },
      ]);
    }
    patch.status = status;
  }

  return repo.updateSupplier(shopId, id, patch);
}

export function archiveSupplier(shopId: string, id: string): Promise<void> {
  return repo.archiveSupplier(shopId, id);
}

export async function assignProductSupplier(
  shopId: string,
  productId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const raw = body.supplierId;
  // ⚠ `null` is a legitimate value here — it means "this product has no default supplier", which is
  // an ordinary state the restock queue shows in its own "Unassigned" bucket (FR-018).
  const supplierId = raw === null ? null : typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  if (supplierId === undefined) {
    throw new ProductError("validation", "invalid assignment", [
      { field: "supplierId", message: "must be a supplier id or null" },
    ]);
  }
  return repo.assignProductSupplier(shopId, productId, supplierId);
}
