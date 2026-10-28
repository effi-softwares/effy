// Each field is checked here, naming its field, before the database's CHECKs see it. Once used, a
// change to what a promotion gives or who it is for is 409 `promotion_used`; dates, limits, words and
// groups stay editable.
import { offsetListPage, parseListQuery } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";
import { givesOf, offerLabelOf, type PromotionRecord, termsOf } from "@effy/edge-shared/promotions";
import type {
  AdminPromotionDTO,
  AdminPromotionListDTO,
  AdminPromotionListItemDTO,
  AuditEntryDTO,
} from "@effy/shared-types";

import { PROMOTION_LIST_SPEC } from "./list";
import * as repo from "./promotion-repository";
import { type PromotionWrite, type PromotionWriteExtras } from "./promotion-repository";
import { type FieldIssue, PromoError } from "./types";

const KINDS = ["cart", "item", "bxgy", "delivery"] as const;
const TRIGGERS = ["automatic", "code"] as const;
const VALUE_TYPES = ["percent", "amount", "free"] as const;
const AUDIENCES = ["everyone", "first_order", "new_customers", "chosen"] as const;
const ACTIONS = ["publish", "pause", "resume", "end", "archive"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = /^\d{1,8}(\.\d{1,2})?$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CODE = /^[A-Z0-9-]{3,32}$/;

const FROZEN = ["kind", "trigger", "valueType", "percentOff", "amountOff", "maxDiscount", "bxgy", "appliesTo", "targets", "audience", "minSubtotal", "minQuantity", "deliveryTypes"] as const;

const changed = () => announce([{ scope: "ops", kind: "promotions" }]);

function refuse(fields: FieldIssue[]): never {
  throw new PromoError(422, "validation_failed", fields.map((f) => `${f.field}: ${f.message}`).join("; "), fields);
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const money = (v: unknown) => (typeof v === "string" && MONEY.test(v) ? Number(v).toFixed(2) : null);
const posInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
const trimmed = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max + 1) : null);

/** `current` is the promotion as it stands, so a partial body is judged with what it leaves alone. */
export function parseWrite(body: Record<string, unknown>, current: PromotionRecord | null): { w: PromotionWrite; x: PromotionWriteExtras } {
  const issues: FieldIssue[] = [];
  const bad = (field: string, message: string) => issues.push({ field, message });
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const w: PromotionWrite = {};
  const x: PromotionWriteExtras = {};

  if (has("name") || !current) {
    const name = trimmed(body.name, 120);
    if (!name) bad("name", "required");
    else if (name.length > 120) bad("name", "at most 120 characters");
    else w.name = name;
  }

  const kind = has("kind") ? body.kind : (current?.words.kind ?? undefined);
  if (has("kind") || !current) {
    if (!isOneOf(KINDS, body.kind)) bad("kind", "must be cart, item, bxgy or delivery");
    else w.kind = body.kind;
  }
  if (has("trigger") || !current) {
    if (!isOneOf(TRIGGERS, body.trigger)) bad("trigger", "must be automatic or code");
    else w.trigger = body.trigger;
  }
  const trigger = w.trigger ?? current?.trigger;

  if (has("valueType") || !current) {
    if (!isOneOf(VALUE_TYPES, body.valueType)) bad("valueType", "must be percent, amount or free");
    else w.valueType = body.valueType;
  }
  const valueType = w.valueType ?? current?.words.valueType;
  if (valueType === "free" && kind !== "delivery" && kind !== "bxgy") bad("valueType", "free is for delivery or buy-X-get-Y");

  if (has("valueType") || has("percentOff") || has("amountOff") || !current) {
    if (valueType === "percent") {
      const p = typeof body.percentOff === "number" ? body.percentOff : NaN;
      if (!(p > 0 && p <= 100) || Math.round(p * 100) !== p * 100) bad("percentOff", "between 0.01 and 100");
      else { w.percentOff = p; w.amountOff = null; }
    } else if (valueType === "amount") {
      const a = money(body.amountOff);
      if (!a || Number(a) <= 0) bad("amountOff", "an amount above 0, like 5.00");
      else { w.amountOff = a; w.percentOff = null; w.maxDiscount = null; }
    } else if (valueType === "free") {
      w.percentOff = null; w.amountOff = null; w.maxDiscount = null;
    }
  }
  if (has("maxDiscount")) {
    if (body.maxDiscount === null || body.maxDiscount === "") w.maxDiscount = null;
    else if (valueType !== "percent") bad("maxDiscount", "only for a percentage");
    else if (!money(body.maxDiscount) || Number(body.maxDiscount) <= 0) bad("maxDiscount", "an amount above 0");
    else w.maxDiscount = money(body.maxDiscount);
  }

  if (has("bxgy") || (kind === "bxgy" && !current)) {
    const b = (body.bxgy ?? null) as { buy?: unknown; get?: unknown; maxPerOrder?: unknown } | null;
    if (kind === "bxgy") {
      const buy = posInt(b?.buy);
      const get = posInt(b?.get);
      if (!buy) bad("bxgy.buy", "a whole number above 0");
      if (!get) bad("bxgy.get", "a whole number above 0");
      w.bxgyBuy = buy; w.bxgyGet = get;
      w.bxgyMaxPerOrder = b?.maxPerOrder == null ? null : posInt(b.maxPerOrder) ?? (bad("bxgy.maxPerOrder", "a whole number above 0"), null);
    } else {
      w.bxgyBuy = null; w.bxgyGet = null; w.bxgyMaxPerOrder = null;
    }
  }

  if (has("appliesTo") || has("kind") || !current) {
    const appliesTo = kind === "cart" || kind === "delivery" ? "cart" : body.appliesTo;
    if (!isOneOf(["cart", "products", "categories", "brands"] as const, appliesTo) || ((kind === "item" || kind === "bxgy") && appliesTo === "cart")) {
      bad("appliesTo", "choose products, categories or brands");
    } else w.appliesTo = appliesTo;
  }
  if (has("targets") || ((kind === "item" || kind === "bxgy") && !current)) {
    const t = (body.targets ?? {}) as { productIds?: unknown; categoryIds?: unknown; brands?: unknown };
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && UUID.test(s)) : []);
    const brands = Array.isArray(t.brands) ? [...new Set(t.brands.filter((b): b is string => typeof b === "string").map((b) => b.trim()).filter(Boolean))] : [];
    const appliesTo = w.appliesTo ?? current?.appliesTo;
    x.targets = {
      productIds: appliesTo === "products" ? ids(t.productIds) : [],
      categoryIds: appliesTo === "categories" ? ids(t.categoryIds) : [],
      brands: appliesTo === "brands" ? brands : [],
    };
    const n = x.targets.productIds.length + x.targets.categoryIds.length + x.targets.brands.length;
    if (appliesTo !== "cart" && n === 0) bad("targets", "choose at least one");
  }

  if (has("deliveryTypes")) {
    const d = Array.isArray(body.deliveryTypes) ? [...new Set(body.deliveryTypes)].filter((v): v is "effy" | "courier" => v === "effy" || v === "courier") : [];
    if (d.length === 0) bad("deliveryTypes", "choose Effy delivery, courier, or both");
    else w.deliveryTypes = d;
  }
  if (has("audience")) {
    if (!isOneOf(AUDIENCES, body.audience)) bad("audience", "must be everyone, first_order, new_customers or chosen");
    else w.audience = body.audience;
  }
  if (has("minSubtotal")) {
    const m = body.minSubtotal === "" || body.minSubtotal === null ? "0.00" : money(body.minSubtotal);
    if (m === null) bad("minSubtotal", "an amount like 30.00, or 0.00 for none");
    else w.minSubtotal = m;
  }
  if (has("minQuantity")) w.minQuantity = body.minQuantity == null ? null : posInt(body.minQuantity) ?? (bad("minQuantity", "a whole number above 0"), null);

  const date = (field: "startsAt" | "endsAt") => {
    if (!has(field)) return;
    const v = body[field];
    if (v === null || v === "") w[field] = null;
    else if (typeof v !== "string" || Number.isNaN(Date.parse(v))) bad(field, "a date and time");
    else w[field] = new Date(v).toISOString();
  };
  date("startsAt");
  date("endsAt");
  const starts = w.startsAt !== undefined ? w.startsAt : current?.startsAt?.toISOString() ?? null;
  const ends = w.endsAt !== undefined ? w.endsAt : null;
  if (starts && ends && Date.parse(ends) <= Date.parse(starts)) bad("endsAt", "after the start");

  if (has("daysOfWeek")) {
    const d = body.daysOfWeek;
    if (d === null) w.daysOfWeek = null;
    else if (!Array.isArray(d) || d.length === 0 || !d.every((n) => Number.isInteger(n) && n >= 1 && n <= 7)) bad("daysOfWeek", "days 1 (Mon) to 7 (Sun)");
    else w.daysOfWeek = [...new Set(d as number[])].sort();
  }
  if (has("timeFrom") || has("timeTo")) {
    const from = body.timeFrom ?? null;
    const to = body.timeTo ?? null;
    if ((from === null) !== (to === null)) bad("timeTo", "set both times, or neither");
    else if (from !== null && (!TIME.test(String(from)) || !TIME.test(String(to)) || String(to) <= String(from))) bad("timeTo", "HH:MM, after the start time");
    else { w.timeFrom = from as string | null; w.timeTo = to as string | null; }
  }
  const cap = (field: "maxUses" | "maxUsesPerCustomer") => {
    if (!has(field)) return;
    w[field] = body[field] == null || body[field] === "" ? null : posInt(body[field]) ?? (bad(field, "a whole number above 0, or empty for no limit"), null);
  };
  cap("maxUses");
  cap("maxUsesPerCustomer");
  if (has("budget")) {
    if (body.budget === null || body.budget === "") w.budget = null;
    else if (!money(body.budget) || Number(body.budget) <= 0) bad("budget", "an amount above 0, or empty for no budget");
    else w.budget = money(body.budget);
  }
  if (has("combinable")) {
    if (typeof body.combinable !== "boolean") bad("combinable", "true or false");
    else w.combinable = body.combinable;
  }

  const words = (field: "headline" | "supportingLine" | "label", max: number) => {
    if (!has(field)) return;
    const v = body[field];
    if (v === null || (typeof v === "string" && v.trim() === "")) w[field] = null;
    else if (typeof v !== "string" || v.trim().length > max) bad(field, `at most ${max} characters`);
    else w[field] = v.trim();
  };
  words("headline", 80);
  words("supportingLine", 160);
  words("label", 24);

  if (has("sharedCode")) {
    const c = typeof body.sharedCode === "string" ? body.sharedCode.replace(/\s+/g, "").toUpperCase() : null;
    if (body.sharedCode === null || c === "") x.sharedCode = null;
    else if (!c || !CODE.test(c)) bad("sharedCode", "3–32 letters, numbers or dashes");
    else x.sharedCode = c;
  }
  if (trigger === "code" && !current && !x.sharedCode && body.codeMode !== "single_use") bad("sharedCode", "a code promotion needs a code shoppers type");
  if (trigger === "automatic" && has("sharedCode") && x.sharedCode) bad("sharedCode", "an automatic promotion has no code");

  if (has("groupIds")) {
    const g = Array.isArray(body.groupIds) ? body.groupIds.filter((s): s is string => typeof s === "string" && UUID.test(s)) : null;
    if (!g) bad("groupIds", "a list of groups");
    else x.groupIds = [...new Set(g)];
    const headline = w.headline !== undefined ? w.headline : current?.headline ?? null;
    if (g && g.length > 0 && !headline) bad("headline", "add a headline to show it in a group");
  }
  if (body.publish === true && !current) x.publish = true;

  if (issues.length > 0) refuse(issues);
  return { w, x };
}

function assertNotFrozen(body: Record<string, unknown>, used: boolean): void {
  if (!used) return;
  const touched = FROZEN.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
  if (touched.length > 0) {
    throw new PromoError(409, "promotion_used", "This promotion has been used, so what it gives and who it is for can no longer change.", touched.map((field) => ({ field, message: "fixed once used" })));
  }
}

const WHO: Record<PromotionRecord["audience"], string> = {
  everyone: "Everyone",
  first_order: "First order",
  new_customers: "New customers",
  chosen: "Chosen customers",
};

const minuteToTime = (m: number | null) => (m === null ? null : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
const cents = (n: number | null) => (n === null ? null : (n / 100).toFixed(2));

export function toDetailDTO(r: PromotionRecord, x: repo.DetailExtras): AdminPromotionDTO {
  const w = r.words;
  return {
    id: r.id,
    name: r.name,
    kind: w.kind,
    trigger: r.trigger,
    state: r.state,
    valueType: w.valueType,
    percentOff: w.percentOff,
    amountOff: cents(w.amountOffCents),
    maxDiscount: cents(w.maxDiscountCents),
    bxgy: w.bxgy,
    appliesTo: r.appliesTo,
    targets: x.targets,
    deliveryTypes: [...w.deliveryTypes],
    audience: r.audience,
    chosenCustomerCount: x.chosen,
    minSubtotal: (w.minSubtotalCents / 100).toFixed(2),
    minQuantity: w.minQuantity,
    startsAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt && (!x.ended_at || r.endsAt.getTime() !== x.ended_at.getTime()) ? r.endsAt.toISOString() : null,
    endedAt: x.ended_at?.toISOString() ?? null,
    daysOfWeek: w.daysOfWeek ? [...w.daysOfWeek] : null,
    timeFrom: minuteToTime(w.minuteFrom),
    timeTo: minuteToTime(w.minuteTo),
    maxUses: r.maxUses,
    maxUsesPerCustomer: r.maxUsesPerCustomer,
    budget: cents(r.budgetCents),
    combinable: r.combinable,
    sharedCode: r.sharedCode,
    singleUseCodeCount: x.single_use,
    headline: r.headline,
    supportingLine: r.supportingLine,
    label: r.label,
    groups: x.groups,
    images: x.images,
    used: x.used,
    uses: r.uses,
    given: (r.givenCents / 100).toFixed(2),
    terms: termsOf(w),
    gives: givesOf(w),
    publishedAt: x.published_at?.toISOString() ?? null,
    createdBy: x.created_by,
    updatedBy: x.updated_by,
    createdAt: x.created_at.toISOString(),
    updatedAt: x.updated_at.toISOString(),
  };
}

/** Promotions as a console list (103); the state counts ride along for the view select. */
export async function listPromotions(q: Readonly<Record<string, string | undefined>> | null | undefined, now = new Date()): Promise<AdminPromotionListDTO> {
  const req = parseListQuery(q, PROMOTION_LIST_SPEC);
  const res = await repo.listPromotions(req, now);
  const items: AdminPromotionListItemDTO[] = res.rows.map((row) => {
    const rec = res.records.get(row.id);
    const singles = Number(row.single_use);
    return {
      id: row.id,
      name: row.name,
      kind: rec?.words.kind ?? "cart",
      trigger: rec?.trigger ?? "automatic",
      state: row.state,
      gives: rec ? givesOf(rec.words) : "",
      who: rec ? WHO[rec.audience] : "",
      codeSummary: row.shared_code ?? (singles > 0 ? `${singles} single-use codes` : null),
      startsAt: row.starts_at?.toISOString() ?? null,
      endsAt: row.ends_at?.toISOString() ?? null,
      uses: Number(row.uses),
      maxUses: row.max_uses,
      groups: row.groups,
      updatedAt: row.updated_at.toISOString(),
    };
  });
  return { ...offsetListPage(items, req, res), counts: res.counts };
}

export async function readPromotion(id: string, now = new Date()): Promise<AdminPromotionDTO> {
  if (!UUID.test(id)) throw new PromoError(404, "not_found", "promotion not found");
  const found = await repo.readPromotion(id, now);
  if (!found) throw new PromoError(404, "not_found", "promotion not found");
  return toDetailDTO(found.record, found.extras);
}

export async function createPromotion(body: Record<string, unknown>, actor: string): Promise<AdminPromotionDTO> {
  const { w, x } = parseWrite(body, null);
  const id = await repo.createPromotion(w, x, actor);
  await changed();
  return readPromotion(id);
}

export async function updatePromotion(id: string, body: Record<string, unknown>, actor: string): Promise<AdminPromotionDTO> {
  if (!UUID.test(id)) throw new PromoError(404, "not_found", "promotion not found");
  const found = await repo.readPromotion(id, new Date());
  if (!found) throw new PromoError(404, "not_found", "promotion not found");
  if (typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt !== found.extras.updated_at.toISOString()) {
    throw new PromoError(409, "stale", "Someone else changed this promotion. Reload it to see their change.");
  }
  assertNotFrozen(body, found.extras.used);
  const { w, x } = parseWrite(body, found.record);
  await repo.updatePromotion(id, w, x, actor, FROZEN.some((k) => Object.prototype.hasOwnProperty.call(body, k)));
  await changed();
  return readPromotion(id);
}

export async function actOn(id: string, action: unknown, actor: string): Promise<AdminPromotionDTO> {
  if (!isOneOf(ACTIONS, action)) refuse([{ field: "action", message: "publish, pause, resume, end or archive" }]);
  const current = await readPromotion(id);
  const allowed: Record<(typeof ACTIONS)[number], boolean> = {
    publish: current.state === "draft",
    pause: !["draft", "paused", "ended", "archived"].includes(current.state),
    resume: current.state === "paused",
    end: !["ended", "archived", "draft"].includes(current.state),
    archive: current.state !== "archived",
  };
  if (!allowed[action as (typeof ACTIONS)[number]]) {
    throw new PromoError(409, "action_not_allowed", `A promotion that is ${current.state.replace("_", " ")} can't be told to ${action}.`);
  }
  await repo.applyAction(id, action as (typeof ACTIONS)[number], actor);
  await changed();
  return readPromotion(id);
}

export async function deletePromotion(id: string, actor: string): Promise<void> {
  if (!UUID.test(id)) throw new PromoError(404, "not_found", "promotion not found");
  await repo.deletePromotion(id, actor);
  await changed();
}

export async function promotionAudit(id: string): Promise<AuditEntryDTO[]> {
  if (!UUID.test(id)) throw new PromoError(404, "not_found", "promotion not found");
  return repo.promotionAudit(id, 100);
}

export async function searchProducts(q: unknown): Promise<{ id: string; name: string; brand: string | null }[]> {
  const term = typeof q === "string" ? q.trim() : "";
  return term.length < 2 ? [] : repo.searchProducts(term.slice(0, 80), 20);
}

export { offerLabelOf };
