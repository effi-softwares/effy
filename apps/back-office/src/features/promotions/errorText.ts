import { isDomainError } from "@effy/api-client";

/**
 * Non-leaking copy for promotion refusals. The admin service names each refusal by its problem
 * `type`; we map it to our own words (never the server's `detail`), because the operator's next move
 * differs: a used promotion keeps what it gives (archive or start a new one), a taken code needs another
 * code, a stale edit needs a reload.
 */
const BY_TYPE: Record<string, string> = {
  "promotion-used": "This promotion has been used, so what it gives and who it is for can no longer change. Its dates, limits, words and groups still can.",
  "code-taken": "That code is already used by another promotion. Choose a different code.",
  stale: "Someone else changed this promotion. Reload it to see their change, then try again.",
  "headline-required": "Add a headline before showing this promotion in a group.",
  "action-not-allowed": "That can't be done to a promotion in its current state.",
  "key-taken": "That key is already used by another group.",
  // Skins and pictures.
  "skin-unreadable": "Some words would be hard to read on what they sit on. Fix the pairs marked below, then save.",
  "invalid-skin": "Some settings aren't valid. Check the fields marked below.",
  "name-taken": "Another skin already has that name.",
  "skin-changed": "Someone else saved this skin while you were editing. Reload it to see their change, then make yours again.",
  "skin-built-in": "Classic is built in: it draws each place as it always looked, and can't be changed or removed.",
  "skin-does-not-fit": "That skin's layout doesn't fit the size of this place.",
  "unknown-skin": "That skin no longer exists. Reload and choose another.",
  "image-not-on-promotion": "That picture belongs to another promotion.",
  "too-many-images": "A promotion has at most 10 pictures. Remove one first.",
  "invalid-upload": "That file can't be used: a JPEG, PNG or WebP picture up to 10 MB.",
  "not-a-picture": "That file isn't a picture we can show.",
  "picture-too-small": "That picture is too small — at least 320 pixels on its shorter side.",
  "not-uploaded": "The picture hasn't finished uploading. Try again.",
  "already-added": "That picture is already on this promotion.",
};

/** A refusal that names places (a skin or picture in use) says which, in our words. */
export function inUseError(err: unknown, what: "skin" | "picture"): string | null {
  if (!isDomainError(err)) return null;
  const slug = err.type?.split("/").pop() ?? "";
  if (slug !== "skin-in-use" && slug !== "image-in-use") return null;
  const where = (err.fields ?? []).map((f) => f.message).filter(Boolean);
  const list = where.length ? where.join(", ") : "some places";
  return what === "skin"
    ? `This skin is in use: ${list}. Choose another skin in those places first.`
    : `This picture is shown in ${list}. Removing it shows the next best picture there instead.`;
}

export function promotionMutationError(err: unknown): string {
  if (isDomainError(err)) {
    const slug = err.type?.split("/").pop() ?? "";
    if (BY_TYPE[slug]) return BY_TYPE[slug];
    if (err.kind === "forbidden") return "You don't have permission to do this.";
    if (err.kind === "not-found") return "That promotion no longer exists.";
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment.";
    if (err.status === 400 || err.status === 422) {
      const fields = (err.fields ?? []).map((f) => f.field).filter(Boolean);
      return fields.length ? `Check ${fields.join(", ")} and try again.` : "Please check the fields and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

/** The fields the server refused, for marking them in the form. */
export function refusedFields(err: unknown): Set<string> {
  return new Set(isDomainError(err) ? (err.fields ?? []).map((f) => f.field) : []);
}
