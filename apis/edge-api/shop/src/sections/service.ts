// Service for shop-local sections (016, US5): validation + orchestration. No HTTP/SQL. Reuses the
// products ProductError so the shop handler maps errors uniformly.
import { ProductError } from "../products/types";
import * as repo from "./repository";
import type { ShopSection } from "./types";

function optInt(value: unknown, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function listSections(shopId: string): Promise<ShopSection[]> {
  return repo.listSections(shopId);
}

export function createSection(shopId: string, body: Record<string, unknown>): Promise<ShopSection> {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    throw new ProductError("validation", "invalid section", [{ field: "name", message: "must be a non-empty string" }]);
  }
  return repo.createSection(shopId, name, optInt(body.displayOrder, 0) ?? 0);
}

export function updateSection(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<ShopSection> {
  const name = "name" in body ? (typeof body.name === "string" && body.name.trim() ? body.name.trim() : null) : null;
  if ("name" in body && name === null) {
    throw new ProductError("validation", "invalid section", [{ field: "name", message: "must be a non-empty string" }]);
  }
  const displayOrder = "displayOrder" in body ? optInt(body.displayOrder, null) : null;
  return repo.updateSection(shopId, id, { name, displayOrder });
}

export async function deleteSection(shopId: string, id: string): Promise<void> {
  const ok = await repo.deleteSection(shopId, id);
  if (!ok) throw new ProductError("not_found", "section not found");
}
