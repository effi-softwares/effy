// The shop's adapter onto the shared presign helper: the `products/` key prefix, and `MediaValidationError` mapped to `ProductError`.
import {
  isMediaValidationError,
  presignRead as sharedPresignRead,
  presignUpload as sharedPresignUpload,
} from "@effy/edge-shared";

import { ProductError } from "./types";

const KEY_PREFIX = "products";

/** A presigned PUT url and the object key it will live at. */
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

/** For list and detail responses. */
export async function presignRead(storageKey: string): Promise<string> {
  return sharedPresignRead(storageKey);
}
