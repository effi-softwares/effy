// Extra placements and the missing-details list (101, US8).
import { offsetListPage, withTransaction } from "@effy/edge-shared";
import { TaxonomyRefusal } from "@effy/edge-shared/catalog";
import { PLACEMENTS_MAX, type MissingDetailsPageDTO, type PlacementsDTO } from "@effy/shared-types";

import type { MissingDetailsRequest } from "../review/list";
import * as repo from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (code: string, message: string) => new TaxonomyRefusal("validation", code, message, [{ field: "categoryIds", message }]);

export async function setPlacements(productId: string, body: Record<string, unknown>, actor: string): Promise<PlacementsDTO> {
  if (!UUID.test(productId)) throw new TaxonomyRefusal("not_found", "not_found", "product not found");
  const raw = body.categoryIds;
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" || !UUID.test(x))) throw invalid("invalid_body", "a list of category ids");
  const ids = [...new Set(raw as string[])].sort();
  if (ids.length > PLACEMENTS_MAX) throw invalid("too_many_placements", `at most ${PLACEMENTS_MAX} extra categories`);
  return withTransaction(async (tx) => {
    const home = await repo.productHome(tx, productId);
    if (!home) throw new TaxonomyRefusal("not_found", "not_found", "product not found");
    if (ids.includes(home)) throw invalid("placement_is_home", "the product's own category is not an extra one");
    const leaves = await repo.activeLeaves(tx, ids);
    if (ids.some((id) => !leaves.has(id))) throw invalid("category_not_leaf", "choose categories with no sub-categories");
    const before = await repo.currentPlacements(tx, productId);
    await repo.replacePlacements(tx, productId, ids, actor);
    await repo.auditPlacements(tx, actor, productId, before, ids);
    return { categoryIds: ids };
  });
}

export async function missingDetails(req: MissingDetailsRequest): Promise<MissingDetailsPageDTO> {
  const r = await repo.missingDetailsPage(req);
  return offsetListPage(
    r.rows.map((x) => ({ productId: x.id, shopName: x.shop_name, name: x.name, categoryPath: x.path, missing: x.missing })),
    req,
    r,
  );
}
