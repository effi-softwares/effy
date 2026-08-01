// Service layer for same-day declaration approvals (032 US3) — validation and orchestration. No HTTP,
// no SQL (Principle VI). Tests mock ./approvals-repository at the module boundary.
//
// ⚠ THIS IS WHAT MAKES US2 SAFE RATHER THAN MERELY RECORDED. A shop's declaration changes nothing
// until one of these functions runs.
import * as repo from "./approvals-repository";
import { DeliveryError, type DeclarationReview, type DeclarationStatus } from "./types";

const STATUSES: readonly DeclarationStatus[] = [
  "pending",
  "approved",
  "declined",
  "revoked",
  "superseded",
];

/**
 * The queue. Defaults to `pending` — the things awaiting a decision.
 *
 * ⚠ FR-027: a declaration waiting on a person must be VISIBLE, not silently queued. Defaulting to
 * pending is what makes "is anything waiting?" the first question this endpoint answers.
 */
export function listDeclarations(statusRaw?: string): Promise<DeclarationReview[]> {
  if (statusRaw === "all") return repo.listDeclarations(null);
  const status = statusRaw && (STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as DeclarationStatus)
    : "pending";
  return repo.listDeclarations(status);
}

export async function getDeclaration(id: string): Promise<DeclarationReview> {
  const found = await repo.getDeclaration(id);
  if (!found) throw new DeliveryError("not_found", "declaration not found");
  return found;
}

/** Approve. An optional note; the shop sees the approval either way. */
export async function approve(id: string, body: Record<string, unknown>, actorSub: string): Promise<DeclarationReview> {
  await repo.approveDeclaration(id, actorSub, optNote(body));
  return getDeclaration(id);
}

/**
 * Decline. ⚠ THE REASON IS REQUIRED (FR-024).
 *
 * A decline with no reason tells a shop only that Effy said no — so they resubmit the same thing, or
 * quietly stop asking. The one case where the shop most needs the words is the one this feature
 * exists for: "Ballarat is 98 km away" is a fact they can act on; silence is not.
 */
export async function decline(id: string, body: Record<string, unknown>, actorSub: string): Promise<DeclarationReview> {
  const note = requireNote(body, "declining");
  await repo.declineDeclaration(id, actorSub, note);
  return getDeclaration(id);
}

/**
 * Revoke an approval in force (FR-025). ⚠ Also requires a reason: this takes away something the shop
 * already had, which needs more explanation than refusing something they asked for, not less.
 */
export async function revoke(id: string, body: Record<string, unknown>, actorSub: string): Promise<DeclarationReview> {
  const note = requireNote(body, "withdrawing same-day");
  await repo.revokeDeclaration(id, actorSub, note);
  return getDeclaration(id);
}

function optNote(body: Record<string, unknown>): string | null {
  const note = typeof body.note === "string" ? body.note.trim() : "";
  return note.length > 0 ? note : null;
}

function requireNote(body: Record<string, unknown>, action: string): string {
  const note = optNote(body);
  if (!note) {
    throw new DeliveryError("unprocessable", `a reason is required when ${action}, so the shop knows why`, [
      { field: "note", message: "is required" },
    ], "reason_required");
  }
  return note;
}
