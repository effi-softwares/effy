// Service layer for delivery-zones & pricing management — validation and orchestration. No HTTP and
// no SQL (Principle VI). Dependencies are wired by explicit module imports (no DI framework); tests
// mock ./repository at the module boundary. Mirrors 009 shops/service.ts.
import * as repo from "./repository";
import {
  type AuditEntry,
  type DeliveryMethod,
  type DeliveryStatus,
  type DeliveryZone,
  DeliveryError,
  DELIVERY_METHODS,
  DELIVERY_STATUSES,
  type FieldIssue,
  type Offering,
  type Paged,
  type ShopLocation,
  type ZonePostcode,
} from "./types";

// ── Validation helpers ───────────────────────────────────────────────────────────────────────

const PRICE_RE = /^\d+(\.\d{1,2})?$/; // integer or 2-decimal money string, non-negative
const POSTCODE_RE = /^\d{4}$/; // AU postcodes are 4 digits
const CUTOFF_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:mm 24h

function requireText(value: unknown, field: string, fields: FieldIssue[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    fields.push({ field, message: "must be a non-empty string" });
    return null;
  }
  return value.trim();
}

function coercePage(page?: number): number {
  return page && page > 0 ? Math.floor(page) : 1;
}
function coercePageSize(pageSize: number | undefined, def: number): number {
  return pageSize && pageSize > 0 ? Math.min(Math.floor(pageSize), 100) : def;
}

// ── Zone reads ─────────────────────────────────────────────────────────────────────────────

export async function listZones(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  q?: string;
}): Promise<Paged<DeliveryZone>> {
  const status =
    params.status && (DELIVERY_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as DeliveryStatus)
      : null;
  const q = params.q && params.q.trim().length > 0 ? params.q.trim() : null;
  return repo.listZones({
    page: coercePage(params.page),
    pageSize: coercePageSize(params.pageSize, 20),
    status,
    q,
  });
}

export async function getZone(zoneId: string): Promise<DeliveryZone> {
  const zone = await repo.readZone(zoneId);
  if (!zone) throw new DeliveryError("not_found", "zone not found");
  return zone;
}

export async function listZonePostcodes(
  zoneId: string,
  page?: number,
  pageSize?: number,
): Promise<Paged<ZonePostcode>> {
  const zone = await repo.readZone(zoneId);
  if (!zone) throw new DeliveryError("not_found", "zone not found");
  return repo.listZonePostcodes(zoneId, coercePage(page), coercePageSize(pageSize, 100));
}

export async function getZoneHistory(
  zoneId: string,
  page?: number,
  pageSize?: number,
): Promise<Paged<AuditEntry>> {
  return repo.listZoneHistory(zoneId, coercePage(page), coercePageSize(pageSize, 50));
}

// ── Zone writes ──────────────────────────────────────────────────────────────────────────────

export async function createZone(
  input: { code?: unknown; name?: unknown },
  actorSub: string,
): Promise<DeliveryZone> {
  const fields: FieldIssue[] = [];
  const code = requireText(input.code, "code", fields);
  const name = requireText(input.name, "name", fields);
  if (fields.length > 0) throw new DeliveryError("validation", "invalid zone", fields);
  return repo.createZone({ code: code!, name: name! }, actorSub);
}

export async function updateZone(
  zoneId: string,
  patch: { name?: unknown; status?: unknown },
  actorSub: string,
): Promise<DeliveryZone> {
  const current = await repo.readZone(zoneId);
  if (!current) throw new DeliveryError("not_found", "zone not found");

  const hasName = "name" in patch && patch.name !== undefined;
  const hasStatus = "status" in patch && patch.status !== undefined;
  if (!hasName && !hasStatus) {
    throw new DeliveryError("validation", "nothing to update", [
      { field: "body", message: "provide name and/or status" },
    ]);
  }

  let name = current.name;
  if (hasName) {
    if (typeof patch.name !== "string" || patch.name.trim().length === 0) {
      throw new DeliveryError("validation", "invalid zone", [
        { field: "name", message: "must be a non-empty string" },
      ]);
    }
    name = patch.name.trim();
  }

  let status = current.status;
  if (hasStatus) {
    if (typeof patch.status !== "string" || !(DELIVERY_STATUSES as readonly string[]).includes(patch.status)) {
      throw new DeliveryError("validation", "invalid status", [
        { field: "status", message: `must be one of ${DELIVERY_STATUSES.join(", ")}` },
      ]);
    }
    status = patch.status as DeliveryStatus;
  }

  return repo.updateZone(zoneId, { name, status }, actorSub);
}

export async function addZonePostcodes(
  zoneId: string,
  input: { postcodes?: unknown },
  actorSub: string,
): Promise<ZonePostcode[]> {
  const raw = input.postcodes;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new DeliveryError("validation", "invalid postcodes", [
      { field: "postcodes", message: "must be a non-empty array of postcodes" },
    ]);
  }
  const fields: FieldIssue[] = [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const p of raw) {
    if (typeof p !== "string" || !POSTCODE_RE.test(p.trim())) {
      fields.push({ field: "postcodes", message: `"${String(p)}" is not a valid 4-digit postcode` });
      continue;
    }
    const v = p.trim();
    if (!seen.has(v)) {
      seen.add(v);
      cleaned.push(v);
    }
  }
  if (fields.length > 0) throw new DeliveryError("validation", "invalid postcodes", fields);
  return repo.addZonePostcodes(zoneId, cleaned, actorSub);
}

export async function removeZonePostcode(
  zoneId: string,
  postcode: string,
  actorSub: string,
): Promise<void> {
  if (!POSTCODE_RE.test(postcode)) {
    throw new DeliveryError("validation", "invalid postcode", [
      { field: "postcode", message: "must be a 4-digit postcode" },
    ]);
  }
  return repo.removeZonePostcode(zoneId, postcode, actorSub);
}

// ── Offering reads ─────────────────────────────────────────────────────────────────────────

export async function listOfferings(params: {
  page?: number;
  pageSize?: number;
  originZoneId?: string;
  destinationZoneId?: string;
}): Promise<Paged<Offering>> {
  return repo.listOfferings({
    page: coercePage(params.page),
    pageSize: coercePageSize(params.pageSize, 50),
    originZoneId: params.originZoneId?.trim() || null,
    destinationZoneId: params.destinationZoneId?.trim() || null,
  });
}

// ── Offering writes ──────────────────────────────────────────────────────────────────────────

function validateWindow(
  method: DeliveryMethod,
  priceAmount: unknown,
  leadDaysMin: unknown,
  leadDaysMax: unknown,
  sameDayCutoff: unknown,
  fields: FieldIssue[],
): { priceAmount: string; leadDaysMin: number; leadDaysMax: number; sameDayCutoff: string | null } {
  if (typeof priceAmount !== "string" || !PRICE_RE.test(priceAmount.trim())) {
    fields.push({ field: "priceAmount", message: "must be a non-negative money string (e.g. \"5.00\")" });
  }
  const min = Number(leadDaysMin);
  const max = Number(leadDaysMax);
  if (!Number.isInteger(min) || min < 0) {
    fields.push({ field: "leadDaysMin", message: "must be a non-negative integer" });
  }
  if (!Number.isInteger(max) || max < min) {
    fields.push({ field: "leadDaysMax", message: "must be an integer >= leadDaysMin" });
  }
  let cutoff: string | null = null;
  if (sameDayCutoff !== undefined && sameDayCutoff !== null) {
    if (typeof sameDayCutoff !== "string" || !CUTOFF_RE.test(sameDayCutoff.trim())) {
      fields.push({ field: "sameDayCutoff", message: "must be HH:mm (24h)" });
    } else {
      cutoff = sameDayCutoff.trim();
    }
  }
  // A cutoff is only meaningful for same_day; keep it null for other methods (data-model §3).
  if (method !== "same_day") cutoff = null;
  return {
    priceAmount: typeof priceAmount === "string" ? priceAmount.trim() : "",
    leadDaysMin: min,
    leadDaysMax: max,
    sameDayCutoff: cutoff,
  };
}

export async function createOffering(
  input: {
    originZoneId?: unknown;
    destinationZoneId?: unknown;
    method?: unknown;
    priceAmount?: unknown;
    leadDaysMin?: unknown;
    leadDaysMax?: unknown;
    sameDayCutoff?: unknown;
  },
  actorSub: string,
): Promise<Offering> {
  const fields: FieldIssue[] = [];
  const originZoneId = requireText(input.originZoneId, "originZoneId", fields);
  const destinationZoneId = requireText(input.destinationZoneId, "destinationZoneId", fields);
  const method = input.method;
  if (typeof method !== "string" || !(DELIVERY_METHODS as readonly string[]).includes(method)) {
    fields.push({ field: "method", message: `must be one of ${DELIVERY_METHODS.join(", ")}` });
  }
  const window = validateWindow(
    method as DeliveryMethod,
    input.priceAmount,
    input.leadDaysMin,
    input.leadDaysMax,
    input.sameDayCutoff,
    fields,
  );
  if (fields.length > 0) throw new DeliveryError("validation", "invalid offering", fields);

  return repo.createOffering(
    {
      originZoneId: originZoneId!,
      destinationZoneId: destinationZoneId!,
      method: method as DeliveryMethod,
      ...window,
    },
    actorSub,
  );
}

export async function updateOffering(
  offeringId: string,
  patch: {
    priceAmount?: unknown;
    leadDaysMin?: unknown;
    leadDaysMax?: unknown;
    sameDayCutoff?: unknown;
    status?: unknown;
  },
  actorSub: string,
): Promise<Offering> {
  const current = await repo.offeringFields(offeringId);
  if (!current) throw new DeliveryError("not_found", "offering not found");

  const fields: FieldIssue[] = [];
  const priceAmount = "priceAmount" in patch && patch.priceAmount !== undefined ? patch.priceAmount : current.priceAmount;
  const leadDaysMin = "leadDaysMin" in patch && patch.leadDaysMin !== undefined ? patch.leadDaysMin : current.leadDaysMin;
  const leadDaysMax = "leadDaysMax" in patch && patch.leadDaysMax !== undefined ? patch.leadDaysMax : current.leadDaysMax;
  const sameDayCutoff =
    "sameDayCutoff" in patch ? patch.sameDayCutoff : current.sameDayCutoff;

  if (typeof priceAmount !== "string" || !PRICE_RE.test(priceAmount.trim())) {
    fields.push({ field: "priceAmount", message: "must be a non-negative money string" });
  }
  const min = Number(leadDaysMin);
  const max = Number(leadDaysMax);
  if (!Number.isInteger(min) || min < 0) fields.push({ field: "leadDaysMin", message: "must be a non-negative integer" });
  if (!Number.isInteger(max) || max < min) fields.push({ field: "leadDaysMax", message: "must be an integer >= leadDaysMin" });

  let cutoff: string | null = null;
  if (sameDayCutoff !== undefined && sameDayCutoff !== null) {
    if (typeof sameDayCutoff !== "string" || !CUTOFF_RE.test(sameDayCutoff.trim())) {
      fields.push({ field: "sameDayCutoff", message: "must be HH:mm (24h)" });
    } else {
      cutoff = sameDayCutoff.trim();
    }
  }

  let status: DeliveryStatus = current.status;
  if ("status" in patch && patch.status !== undefined) {
    if (typeof patch.status !== "string" || !(DELIVERY_STATUSES as readonly string[]).includes(patch.status)) {
      fields.push({ field: "status", message: `must be one of ${DELIVERY_STATUSES.join(", ")}` });
    } else {
      status = patch.status as DeliveryStatus;
    }
  }

  if (fields.length > 0) throw new DeliveryError("validation", "invalid offering", fields);

  return repo.updateOffering(
    offeringId,
    {
      priceAmount: (priceAmount as string).trim(),
      leadDaysMin: min,
      leadDaysMax: max,
      sameDayCutoff: cutoff,
      status,
    },
    actorSub,
  );
}

// ── Shop location ─────────────────────────────────────────────────────────────────────────────

export async function setShopLocation(
  shopId: string,
  input: { postcode?: unknown },
  actorSub: string,
): Promise<ShopLocation> {
  const hasPostcode = "postcode" in input;
  if (!hasPostcode) {
    throw new DeliveryError("validation", "invalid location", [
      { field: "postcode", message: "provide a postcode, or null to clear" },
    ]);
  }
  const raw = input.postcode;
  let postcode: string | null;
  if (raw === null) {
    postcode = null;
  } else if (typeof raw === "string" && POSTCODE_RE.test(raw.trim())) {
    postcode = raw.trim();
  } else {
    throw new DeliveryError("validation", "invalid location", [
      { field: "postcode", message: "must be a 4-digit postcode, or null to clear" },
    ]);
  }
  return repo.setShopLocation(shopId, postcode, actorSub);
}
