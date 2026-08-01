// Service layer for promotions & order rules — validation and orchestration. No HTTP, no SQL
// (Principle VI). Mirrors the delivery slice; tests mock ./repository at the module boundary.
//
// ⚠ Every refusal here has a DATABASE CHECK behind it (data-model §6, §8). That is deliberate: the
// service's answer and the schema's answer cannot drift, and a bug in this file cannot write a promotion
// the platform could not honour.
import {
  isDimensionsBeyondBuffer,
  isMediaValidationError,
  isUnsupportedImage,
  presignUpload,
  readImageDimensions,
  readObjectPrefix,
} from "@effy/edge-shared";


import * as repo from "./repository";
import { BANNER_CANVAS } from "@effy/shared-types";

import {
  BANNER_PLACEMENTS,
  type FieldIssue,
  type OrderPolicy,
  type Paged,
  PROMO_KINDS,
  PROMO_STATUSES,
  type PromoCode,
  PromoError,
  type PromoStatus,
} from "./types";

const MONEY_RE = /^\d+(\.\d{1,2})?$/; // non-negative, at most 2 decimals

function coercePage(page?: number): number {
  return page && page > 0 ? Math.floor(page) : 1;
}
function coercePageSize(pageSize?: number): number {
  return pageSize && pageSize > 0 ? Math.min(Math.floor(pageSize), 100) : 25;
}

export async function listPromos(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  q?: string;
}): Promise<Paged<PromoCode>> {
  const status =
    params.status && (PROMO_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as PromoStatus)
      : null;
  const q = params.q && params.q.trim().length > 0 ? params.q.trim() : null;
  return repo.listPromos({ page: coercePage(params.page), pageSize: coercePageSize(params.pageSize), status, q });
}

export async function readPromo(id: string): Promise<PromoCode> {
  const found = await repo.readPromo(id);
  if (!found) throw new PromoError(404, "promo_not_found", "no such code");
  return found;
}

export async function auditFor(id: string, limit = 50) {
  await readPromo(id); // 404 rather than an empty trail for a code that does not exist
  return repo.auditFor(id, Math.min(Math.max(limit, 1), 200));
}

/**
 * Validate a code's shape.
 *
 * ⚠ The kind/value pairing is checked here AND by `promo_code_kind_value_chk`. A percentage code carrying
 * an amount is not merely rejected — it is unrepresentable in the schema. This function exists to tell the
 * operator WHICH thing is wrong, not to be the only thing standing between them and a bad row.
 */
function validateDefinition(
  input: {
    code?: string;
    kind?: string;
    percentOff?: number | null;
    amountOff?: string | null;
    minimumSubtotalAmount?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    maxRedemptions?: number | null;
    maxPerCustomer?: number | null;
  },
  { requireAll }: { requireAll: boolean },
): FieldIssue[] {
  const fields: FieldIssue[] = [];

  if (requireAll || input.code !== undefined) {
    if (typeof input.code !== "string" || input.code.trim().length === 0) {
      fields.push({ field: "code", message: "must be a non-empty string" });
    }
  }

  const kind = input.kind;
  if (requireAll || kind !== undefined) {
    if (!kind || !(PROMO_KINDS as readonly string[]).includes(kind)) {
      fields.push({ field: "kind", message: "must be 'percentage' or 'fixed'" });
    }
  }

  if (kind === "percentage") {
    if (typeof input.percentOff !== "number" || input.percentOff <= 0 || input.percentOff > 100) {
      fields.push({ field: "percentOff", message: "must be between 1 and 100" });
    }
    if (input.amountOff != null) {
      fields.push({ field: "amountOff", message: "a percentage code cannot carry an amount" });
    }
  }
  if (kind === "fixed") {
    if (typeof input.amountOff !== "string" || !MONEY_RE.test(input.amountOff) || Number(input.amountOff) <= 0) {
      fields.push({ field: "amountOff", message: "must be an amount greater than zero" });
    }
    if (input.percentOff != null) {
      fields.push({ field: "percentOff", message: "a fixed code cannot carry a percentage" });
    }
  }

  if (input.minimumSubtotalAmount !== undefined && !MONEY_RE.test(input.minimumSubtotalAmount)) {
    fields.push({ field: "minimumSubtotalAmount", message: "must be a non-negative amount" });
  }

  for (const [field, value] of [
    ["maxRedemptions", input.maxRedemptions],
    ["maxPerCustomer", input.maxPerCustomer],
  ] as const) {
    if (value != null && (!Number.isInteger(value) || value <= 0)) {
      fields.push({ field, message: "must be a whole number greater than zero, or omitted for no cap" });
    }
  }

  // An inverted window is not a subtle error — it is a promotion that can never run.
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    fields.push({ field: "endsAt", message: "must be after startsAt" });
  }

  return fields;
}

function refuse(fields: FieldIssue[]): never {
  // One wire reason per shape of mistake, so the console can point at the field that is wrong.
  const first = fields[0]!;
  const code =
    first.field === "endsAt" ? "promo_window_invalid"
    : first.field === "percentOff" ? "promo_percent_invalid"
    : first.field === "amountOff" ? "promo_amount_invalid"
    : first.field === "minimumSubtotalAmount" ? "promo_minimum_invalid"
    : first.field.startsWith("max") ? "promo_cap_invalid"
    : first.field === "kind" ? "promo_kind_mismatch"
    : "promo_definition_invalid";
  throw new PromoError(422, code, first.message, fields);
}

export async function createPromo(
  input: {
    code?: string;
    kind?: string;
    percentOff?: number;
    amountOff?: string;
    minimumSubtotalAmount?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    maxRedemptions?: number | null;
    maxPerCustomer?: number | null;
    isAdvertised?: boolean;
    bannerTitle?: string | null;
    bannerSubtitle?: string | null;
    bannerImageKey?: string | null;
    bannerPosition?: number;
    bannerPlacement?: string;
  },
  actorSub: string,
): Promise<PromoCode> {
  const fields = [...validateDefinition(input, { requireAll: true }), ...validateAdvertising(input)];
  if (fields.length > 0) refuse(fields);

  return repo.createPromo(
    {
      code: input.code!.trim(),
      kind: input.kind!,
      percentOff: input.kind === "percentage" ? input.percentOff! : null,
      amountOff: input.kind === "fixed" ? input.amountOff! : null,
      minimumSubtotalAmount: input.minimumSubtotalAmount ?? "0.00",
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      maxRedemptions: input.maxRedemptions ?? null,
      maxPerCustomer: input.maxPerCustomer ?? null,
      // ⚠ Advertising defaults to OFF. This default is the safety control: private promotions are
      // ordinary (a goodwill credit for one customer, a partner code), and a promotion that became
      // public because nobody said otherwise would hand every shopper a discount meant for one.
      isAdvertised: input.isAdvertised ?? false,
      bannerTitle: input.bannerTitle?.trim() || null,
      bannerSubtitle: input.bannerSubtitle?.trim() || null,
      bannerImageKey: input.bannerImageKey ?? null,
      bannerPosition: input.bannerPosition ?? 0,
      // ⚠ Defaults to the offers carousel (FR-027a) — an operator who advertises without choosing a
      // placement lands where shoppers look for offers, not scattered through the merchandising.
      bannerPlacement: input.bannerPlacement ?? "carousel",
    },
    actorSub,
  );
}

/**
 * The advertising facet's own rules (028 FR-037a/b).
 *
 * ⚠ This DUPLICATES the database's `promo_code_banner_copy_chk`, deliberately and for a different
 * job. The constraint is the GUARANTEE — it cannot be bypassed by a backfill, a second writer or a
 * future route. This exists so an operator gets a field-level message pointing at the empty box,
 * instead of a 500 from a constraint violation. Neither one replaces the other.
 */
function validateAdvertising(input: {
  isAdvertised?: boolean;
  bannerTitle?: string | null;
  bannerPosition?: number;
  bannerPlacement?: string;
}): { field: string; message: string }[] {
  const fields: { field: string; message: string }[] = [];

  if (input.isAdvertised === true && !input.bannerTitle?.trim()) {
    fields.push({
      field: "bannerTitle",
      message: "is required to advertise a promotion — the code is not a sentence a shopper can read",
    });
  }
  if (
    input.bannerPosition !== undefined &&
    (!Number.isInteger(input.bannerPosition) || input.bannerPosition < 0)
  ) {
    fields.push({ field: "bannerPosition", message: "must be a whole number of 0 or more" });
  }
  if (
    input.bannerPlacement !== undefined &&
    !(BANNER_PLACEMENTS as readonly string[]).includes(input.bannerPlacement)
  ) {
    fields.push({
      field: "bannerPlacement",
      message: `must be one of: ${BANNER_PLACEMENTS.join(", ")}`,
    });
  }
  return fields;
}

/**
 * Update a code. The used-code rule (FR-068) is enforced in the repository, inside the transaction that
 * counts redemptions — checking it here would leave a window in which a code is redeemed between the check
 * and the write.
 */
/** How much of the object to read before giving up on finding a header. */
const HEADER_PREFIX_BYTES = 64 * 1024;
const HEADER_PREFIX_RETRY_BYTES = 1024 * 1024;

/**
 * Verify that stored banner artwork is exactly the canonical canvas (029 FR-004).
 *
 * ── ⚠ WHY THIS RUNS SERVER-SIDE AT ALL ──────────────────────────────────────────────────────────
 *
 * The console normalises before upload, and that is a convenience, not a guarantee: artwork reaches
 * S3 through a **presigned PUT that Lambda never sees**, so anyone holding the signed url can put
 * anything at it. FR-004 says stored artwork *must* conform, and a "must" that holds only when the
 * client cooperates is not one. This is the enforcement.
 *
 * ⚠ **It refuses; it never resizes.** Silently altering an operator's artwork is precisely the silent
 * crop FR-008 forbids — and an operator who uploaded the wrong thing needs to know, not to have it
 * quietly changed underneath them.
 *
 * ⚠ **A valid image can hide its dimensions past the first read.** A photo carrying a large EXIF
 * block or an embedded thumbnail can push its JPEG SOF marker past 64 KB. That is an ordinary file,
 * not a broken one, so the range is widened once before giving up — and the refusal then says the
 * file could not be READ, never that its dimensions are wrong, which would blame the operator for
 * artwork that is fine.
 */
async function verifyBannerArtwork(storageKey: string): Promise<void> {
  let buffer: Buffer;
  try {
    buffer = await readObjectPrefix(storageKey, HEADER_PREFIX_BYTES);
  } catch {
    throw new PromoError(422, "promo_banner_image_unreadable", "the uploaded image could not be read", [
      { field: "bannerImageKey", message: "the uploaded file could not be read — try uploading it again" },
    ]);
  }

  let dimensions;
  try {
    dimensions = readImageDimensions(buffer);
  } catch (e) {
    if (isDimensionsBeyondBuffer(e)) {
      // Widen once. Still a legitimate file — just a front-loaded one.
      try {
        dimensions = readImageDimensions(await readObjectPrefix(storageKey, HEADER_PREFIX_RETRY_BYTES));
      } catch {
        throw new PromoError(422, "promo_banner_image_unreadable", "the image header could not be read", [
          { field: "bannerImageKey", message: "the image could not be read — try re-exporting it" },
        ]);
      }
    } else if (isUnsupportedImage(e)) {
      throw new PromoError(422, "promo_banner_image_unreadable", "not a supported image", [
        { field: "bannerImageKey", message: "must be a JPEG, PNG or WebP image" },
      ]);
    } else {
      throw e;
    }
  }

  if (dimensions.width !== BANNER_CANVAS.width || dimensions.height !== BANNER_CANVAS.height) {
    // ⚠ A DISTINCT code from 028's `promo_banner_image_invalid`, which the presign route already uses
    // for content-type and size refusals. One code for two failure modes leaves the console unable to
    // tell an operator which of them happened.
    throw new PromoError(422, "promo_banner_image_wrong_size", "banner artwork is the wrong size", [
      {
        field: "bannerImageKey",
        message:
          `must be exactly ${BANNER_CANVAS.width} × ${BANNER_CANVAS.height} — ` +
          `this image is ${dimensions.width} × ${dimensions.height}. Download the template to start from the right canvas.`,
      },
    ]);
  }
}

export async function updatePromo(id: string, input: Record<string, unknown>, actorSub: string): Promise<PromoCode> {
  const typed = input as Parameters<typeof validateDefinition>[0];
  const advertising = input as Parameters<typeof validateAdvertising>[0];

  // ⚠ On UPDATE the advertising check runs against the MERGED state, not the patch. A request that
  // sets `isAdvertised: true` without a title is refused here; one that only moves the position is
  // not — but a promotion already advertised whose title is being CLEARED must also be refused, and
  // that case only the database constraint can see, because this service does not read the row.
  // Belt and braces, each catching what the other cannot.
  const fields = [...validateDefinition(typed, { requireAll: false }), ...validateAdvertising(advertising)];
  if (fields.length > 0) refuse(fields);

  // ⚠ Verified on SAVE, not on upload — the upload never passes through here (see verifyBannerArtwork).
  const key = (input as { bannerImageKey?: string | null }).bannerImageKey;
  if (typeof key === "string" && key.length > 0) await verifyBannerArtwork(key);

  return repo.updatePromo(id, typed, actorSub);
}

/**
 * Mint a presigned PUT url for banner artwork (028 T048b).
 *
 * Two steps, matching what `shop` already does for product media: the operator PUTs the bytes
 * directly to S3, then saves the returned key as `bannerImageKey` through the ordinary update route.
 * **Bytes never pass through Lambda.**
 *
 * The validation rules (allowed types, size ceiling, TTL) are the SHARED helper's, not new numbers —
 * two services inventing their own image limits is how they end up disagreeing.
 */
export async function presignBannerImage(
  id: string,
  contentType: unknown,
  fileSize: unknown,
): Promise<{ uploadUrl: string; storageKey: string }> {
  // 404 before minting anything: a presigned url for a promotion that does not exist is a writable
  // key with no owner.
  await repo.readPromo(id);

  try {
    return await presignUpload("promotions", id, contentType, fileSize);
  } catch (e) {
    if (isMediaValidationError(e)) {
      throw new PromoError(422, "promo_banner_image_invalid", e.message, e.fields);
    }
    throw e;
  }
}

export async function setStatus(id: string, status: unknown, actorSub: string): Promise<PromoCode> {
  if (typeof status !== "string" || !(PROMO_STATUSES as readonly string[]).includes(status)) {
    throw new PromoError(422, "promo_status_invalid", "status must be 'active' or 'disabled'");
  }
  return repo.setStatus(id, status as PromoStatus, actorSub);
}

export async function deletePromo(id: string, actorSub: string): Promise<void> {
  return repo.deletePromo(id, actorSub);
}

// ── Order rules ──────────────────────────────────────────────────────────────────────────────

export async function readOrderPolicy(): Promise<OrderPolicy> {
  return repo.readOrderPolicy();
}

/**
 * Set the order rules.
 *
 * ⚠ The ceilings are bounded to what the SCHEMA allows: `max_line_quantity` must stay inside
 * `cart_item`'s own `CHECK (quantity <= 99)`, so an operator cannot configure a rule the table would
 * reject at the moment a shopper tried to use it.
 */
export async function writeOrderPolicy(input: Record<string, unknown>, actorSub: string): Promise<OrderPolicy> {
  const fields: FieldIssue[] = [];
  const minimum = input.minimumSubtotalAmount;
  const maxLine = input.maxLineQuantity;
  const maxDistinct = input.maxDistinctItems;

  if (typeof minimum !== "string" || !MONEY_RE.test(minimum)) {
    fields.push({ field: "minimumSubtotalAmount", message: "must be a non-negative amount" });
  }
  if (!Number.isInteger(maxLine) || (maxLine as number) < 1 || (maxLine as number) > 99) {
    fields.push({ field: "maxLineQuantity", message: "must be between 1 and 99" });
  }
  if (!Number.isInteger(maxDistinct) || (maxDistinct as number) < 1 || (maxDistinct as number) > 500) {
    fields.push({ field: "maxDistinctItems", message: "must be between 1 and 500" });
  }
  if (fields.length > 0) {
    throw new PromoError(422, "order_policy_invalid", fields[0]!.message, fields);
  }

  return repo.writeOrderPolicy(
    {
      minimumSubtotalAmount: minimum as string,
      maxLineQuantity: maxLine as number,
      maxDistinctItems: maxDistinct as number,
    },
    actorSub,
  );
}
