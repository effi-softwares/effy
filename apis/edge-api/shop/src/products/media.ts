// Product media — the shop service's adapter onto the shared presign helper.
//
// ── ⚠ THE IMPLEMENTATION MOVED TO @effy/edge-shared (028 T048a) ─────────────────────────────────
//
// This file used to BE the implementation. 028 needed the same direct-to-S3 presigned upload for
// promotional banner artwork in the admin service, and copying ~70 lines of allowed-content-types,
// size ceilings and TTLs into a second service is exactly the cross-cutting duplication Principle II
// prohibits — two files that agree today and drift the first time either is touched.
//
// What remains here is adaptation, and only adaptation:
//   · the `products/` key prefix, which is this service's concern and not the shared layer's;
//   · mapping the shared `MediaValidationError` onto this service's `ProductError`, so callers and
//     handlers are unchanged and the RFC 9457 response shape is identical.
//
// ⚠ The module PATH is kept deliberately. `service.ts` imports `* as media from "./media"` and the
// service tests mock that specifier — collapsing the file would have forced edits to tests that are
// meant to prove this refactor changed nothing.
import {
  isMediaValidationError,
  presignRead as sharedPresignRead,
  presignUpload as sharedPresignUpload,
} from "@effy/edge-shared";

import { ProductError } from "./types";

/** Where product images live in the bucket. Unchanged by the extraction. */
const KEY_PREFIX = "products";

/** Validate a declared upload and mint a presigned PUT url + the object key it will live at. */
export async function presignUpload(
  productId: string,
  contentType: unknown,
  fileSize: unknown,
): Promise<{ uploadUrl: string; storageKey: string }> {
  try {
    return await sharedPresignUpload(KEY_PREFIX, productId, contentType, fileSize);
  } catch (e) {
    if (isMediaValidationError(e)) {
      throw new ProductError("validation", e.message, e.fields);
    }
    throw e;
  }
}

/** A short-lived presigned GET url for reading a stored object (list/detail responses). */
export async function presignRead(storageKey: string): Promise<string> {
  return sharedPresignRead(storageKey);
}
