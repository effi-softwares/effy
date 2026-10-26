// A category's picture (101): a presigned upload under `categories/<id>/` and its public address, the same
// one shoppers are sent (the `categories/` prefix is public: media.tf, media-public.ts).
import { isMediaValidationError, presignUpload, publicImageUrl } from "@effy/edge-shared";
import { TaxonomyRefusal } from "@effy/edge-shared/catalog";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function categoryImageUrl(imageKey: string | null): string | null {
  return imageKey ? publicImageUrl(imageKey) : null;
}

export async function categoryImageUpload(categoryId: string, contentType: unknown, fileSize: unknown): Promise<{ uploadUrl: string; imageKey: string }> {
  if (!UUID.test(categoryId)) throw new TaxonomyRefusal("not_found", "not_found", "category not found");
  try {
    const { uploadUrl, storageKey } = await presignUpload("categories", categoryId, contentType, fileSize);
    return { uploadUrl, imageKey: storageKey };
  } catch (e) {
    if (isMediaValidationError(e)) {
      throw new TaxonomyRefusal("validation", "unsupported_media_type", "a JPEG, PNG or WebP picture up to 10 MB", e.fields);
    }
    throw e;
  }
}
