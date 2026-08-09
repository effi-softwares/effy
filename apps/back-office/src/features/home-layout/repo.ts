import type { HomeLayoutDTO } from "@effy/shared-types";

import { api } from "@/lib/api";

import type { AuditEntry, HomeLayout } from "./model-types";

// The data layer for the Home Composer. Every call maps DTO→domain (identity here, since the
// contracts double as the domain shapes) so screens never touch the api client directly
// (Principle VI). All endpoints live under the admin cold-path service behind the shared gateway.
//
// ⚠ EVERY MUTATION CARRIES A REVISION, and there is no overload that omits one. Optimistic
// concurrency is only worth having if it cannot be bypassed by a caller who forgot the field — the
// server refuses a request without it, and the type here makes forgetting it a compile error.

export async function getLayout(): Promise<HomeLayout> {
  return api.get<HomeLayoutDTO>("/admin/v1/home-layout");
}

export async function saveDraft(input: {
  blocks: HomeLayout["draft"];
  revision: number;
}): Promise<HomeLayout> {
  return api.put<HomeLayoutDTO>("/admin/v1/home-layout/draft", input);
}

export async function publish(input: { revision: number }): Promise<HomeLayout> {
  return api.post<HomeLayoutDTO>("/admin/v1/home-layout/publish", input);
}

export async function revert(input: { revision: number }): Promise<HomeLayout> {
  return api.post<HomeLayoutDTO>("/admin/v1/home-layout/revert", input);
}

export async function getAudit(): Promise<{ items: AuditEntry[] }> {
  return api.get<{ items: AuditEntry[] }>("/admin/v1/home-layout/audit");
}

/** Mint a presigned PUT for block artwork. The console PUTs the bytes straight to S3 (042 US2). */
export async function presignArtwork(
  contentType: string,
  fileSize: number,
): Promise<{ uploadUrl: string; storageKey: string }> {
  return api.post<{ uploadUrl: string; storageKey: string }>(
    "/admin/v1/home-layout/artwork/presign",
    { contentType, fileSize },
  );
}

/**
 * A presigned READ, so the composer can display already-attached artwork.
 *
 * ⚠ Without this the field shows a filename. That is what the promotions console does today, and it
 * means an operator attaches a photograph and has no way to confirm they attached the right one.
 */
export async function viewArtwork(storageKey: string): Promise<{ url: string }> {
  return api.get<{ url: string }>(
    `/admin/v1/home-layout/artwork?key=${encodeURIComponent(storageKey)}`,
  );
}

/** Mint a short-lived grant to view the draft home page (042 US3). */
export async function mintPreview(): Promise<{ token: string; expiresAt: string }> {
  return api.post<{ token: string; expiresAt: string }>("/admin/v1/home-layout/preview");
}
