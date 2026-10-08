// Service for Effy's delivery coverage (076): validation, the refusals, and the two confirmations a
// person must give in words. No SQL, no HTTP (Principle VI).
import { pooled } from "@effy/edge-shared";
import { COURIER_ORDERING_AVAILABLE, coverageForPostcode, normalizePostcode } from "@effy/edge-shared/delivery";
import { announce } from "@effy/edge-shared/live";
import type {
  AddCoveragePostcodesRequest, AddCoveragePostcodesResult, AustralianState, CoverageCheckDTO, CoverageCheckResultDTO,
  CoverageListDTO, CoveragePlaceSearchDTO, PatchCoveragePostcodesRequest,
} from "@effy/shared-types";

import * as repo from "./coverage.repository";

/** A refusal the console tells apart from the others — `code` becomes the problem's type (FR-026). */
export class CoverageError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 422,
    public readonly code: string,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CoverageError";
  }
}

const PAGE = 100;
const SEARCH_LIMIT = 20;
/** Wider than the country. It catches a distance typed in metres, not a far-away town. */
const MAX_KM = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where Effy delivers changed: an open Coverage screen re-reads (FR-028). After commit; never throws. */
const changed = (): Promise<void> => announce([{ scope: "ops", kind: "coverage" }]);

function postcodeOf(input: unknown): string {
  const pc = typeof input === "string" ? normalizePostcode(input) : null;
  if (!pc) throw new CoverageError(400, "invalid_postcode", "a postcode is exactly four digits");
  return pc;
}

/** A hand-entered distance: a number of km, 0 to 5000, kept to two decimals. */
function kmOf(input: unknown): string {
  const n = typeof input === "string" && input.trim() !== "" ? Number(input) : typeof input === "number" ? input : NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_KM) {
    throw new CoverageError(422, "distance_out_of_range", `a distance is between 0 and ${MAX_KM} km`, { maxKm: MAX_KM });
  }
  return n.toFixed(2);
}

function nameOf(input: unknown): string {
  const name = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 60) throw new CoverageError(400, "invalid_name", "a group name is 2 to 60 characters");
  return name;
}

async function groupOf(input: unknown): Promise<string | null> {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string" || !UUID.test(input) || !(await repo.groupById(input))) {
    throw new CoverageError(404, "group_not_found", "that group no longer exists");
  }
  return input;
}

/**
 * ⚠ THE ONE WAY A GROUP IS MORE THAN A LABEL, UNTIL THE DRIVER-OPERATIONS FEATURE (research R6).
 * A driver is cleared for a group, or for everywhere. Postcodes that end up where no cleared driver
 * reaches would be sold at checkout and then left unplanned. That is allowed — staff may be about
 * to clear a driver — but never by accident: it takes an explicit confirmation.
 */
async function requireDrivers(groupId: string | null, confirmed: boolean | undefined): Promise<void> {
  if (confirmed === true) return;
  const n = await repo.driversFor(groupId);
  if (n === 0) {
    throw new CoverageError(409, "no_driver_covers", groupId
      ? "no driver is cleared to deliver to that group"
      : "no driver is cleared to deliver everywhere, and these postcodes would be in no group", { driverCount: 0 });
  }
}

// ── reads ───────────────────────────────────────────────────────────────────────────────────────

export interface ListQuery { group?: string; q?: string; source?: string; review?: string; cursor?: string }

export async function list(input: ListQuery): Promise<CoverageListDTO> {
  const group = input.group === "none" ? "none" : input.group && UUID.test(input.group) ? input.group : undefined;
  const source = input.source === "manual" || input.source === "computed" ? input.source : undefined;
  const q = input.q?.trim() || undefined;
  const after = input.cursor && /^[0-9]{4}$/.test(input.cursor) ? input.cursor : undefined;

  const [rows, groups, totals, offered, exclusions] = await Promise.all([
    repo.listPostcodes({ group, q, source, review: input.review === "true", after, limit: PAGE + 1 }),
    repo.listGroups(),
    repo.totals(),
    repo.courierOffered(),
    repo.listExclusions(),
  ]);
  const page = rows.slice(0, PAGE);
  return {
    postcodes: page.map((r) => ({ ...r, state: r.state as AustralianState | null })),
    ...(rows.length > PAGE ? { nextCursor: page[page.length - 1]!.postcode } : {}),
    groups,
    ungrouped: { postcodeCount: totals.ungrouped, driverCount: totals.ungroupedDrivers },
    courier: { offered, canBeOffered: COURIER_ORDERING_AVAILABLE, exclusions },
    counts: { listed: totals.listed, manualDistance: totals.manualDistance, needsReview: totals.needsReview },
  };
}

export async function searchPlaces(q: string): Promise<CoveragePlaceSearchDTO> {
  const term = q.trim();
  if (term.length < 2) return { results: [] };
  const results = await repo.searchPlaces(term, SEARCH_LIMIT);
  return { results: results.map((r) => ({ ...r, state: r.state as AustralianState | null })) };
}

async function checkOne(postcode: string): Promise<CoverageCheckDTO> {
  const [coverage, place, listed] = await Promise.all([
    coverageForPostcode(pooled, postcode),
    repo.placesOf(postcode),
    repo.listedRow(postcode),
  ]);
  return {
    postcode,
    places: place.places,
    state: place.state as AustralianState | null,
    coverage: coverage.kind,
    reason: coverage.reason,
    groupName: coverage.groupName,
    distanceKm: coverage.distanceKm === null ? null : coverage.distanceKm.toFixed(2),
    distanceSource: listed?.distanceSource ?? null,
    exclusionReason: coverage.reason === "courier_excluded" ? await repo.exclusionReason(postcode) : null,
  };
}

/**
 * "What about this postcode, and why?" (FR-025). A postcode gives one answer — including "not a
 * known postcode". A place name gives one per postcode it is found in.
 *
 * ⚠ The answer is `coverageForPostcode`'s, not this file's: the checker must say what checkout does.
 */
export async function check(q: string): Promise<CoverageCheckResultDTO> {
  const term = q.trim();
  if (/^[0-9]{4}$/.test(term)) return { matches: [await checkOne(term)] };
  if (term.length < 2 || /^[0-9]+$/.test(term)) throw new CoverageError(400, "invalid_query", "enter a four-digit postcode or a place name");
  const postcodes = await repo.postcodesForPlace(term, 10);
  return { matches: await Promise.all(postcodes.map(checkOne)) };
}

// ── the list ────────────────────────────────────────────────────────────────────────────────────

export async function addPostcodes(body: AddCoveragePostcodesRequest, sub: string): Promise<AddCoveragePostcodesResult> {
  if (!Array.isArray(body?.postcodes) || body.postcodes.length === 0 || body.postcodes.length > 50) {
    throw new CoverageError(400, "invalid_request", "name between 1 and 50 postcodes to add");
  }
  const wanted = new Map<string, string | null>();
  for (const item of body.postcodes) {
    const manual = item?.manualDistanceKm;
    wanted.set(postcodeOf(item?.postcode), manual === null || manual === undefined || manual === "" ? null : kmOf(manual));
  }
  const groupId = await groupOf(body.groupId);

  const facts = await repo.postcodeFacts([...wanted.keys()]);
  const unknown = [...wanted.keys()].filter((p) => !facts.get(p)?.known);
  if (unknown.length > 0) {
    throw new CoverageError(422, "unknown_postcode", "not a known postcode", { postcodes: unknown });
  }

  const alreadyListed: string[] = [];
  const toAdd: repo.NewPostcode[] = [];
  const needDistance: string[] = [];
  for (const [postcode, manualKm] of wanted) {
    const f = facts.get(postcode)!;
    if (f.listed) alreadyListed.push(postcode);
    // A person's distance wins when given; otherwise the platform's; otherwise it cannot be listed (FR-009).
    else if (manualKm !== null) toAdd.push({ postcode, distanceKm: manualKm, source: "manual" });
    else if (f.computedKm !== null) toAdd.push({ postcode, distanceKm: f.computedKm, source: "computed" });
    else needDistance.push(postcode);
  }
  if (needDistance.length > 0) {
    throw new CoverageError(422, "distance_required", "no place in this postcode has a known location — enter its distance from the hub", { postcodes: needDistance });
  }
  if (toAdd.length === 0) return { added: [], alreadyListed };

  await requireDrivers(groupId, body.confirmNoDrivers);
  const added = await repo.addPostcodes(toAdd, groupId, sub);
  if (added.length > 0) await changed();
  // Someone else may have listed one between the check and the insert: that is "already listed", not an error.
  return { added, alreadyListed: [...alreadyListed, ...toAdd.map((t) => t.postcode).filter((p) => !added.includes(p))] };
}

export async function removePostcode(postcode: string, sub: string): Promise<void> {
  if (!(await repo.removePostcode(postcodeOf(postcode), sub))) throw new CoverageError(404, "not_listed", "that postcode is not on the list");
  await changed();
}

export async function patchPostcodes(body: PatchCoveragePostcodesRequest, sub: string): Promise<void> {
  if (!Array.isArray(body?.postcodes) || body.postcodes.length === 0 || body.postcodes.length > 500) {
    throw new CoverageError(400, "invalid_request", "name the postcodes to change");
  }
  const postcodes = [...new Set(body.postcodes.map(postcodeOf))];
  const movesGroup = "groupId" in body;
  if (!movesGroup && !body.distance) throw new CoverageError(400, "invalid_request", "nothing to change");

  if (body.distance) {
    if (postcodes.length !== 1) throw new CoverageError(400, "invalid_request", "a distance is set for one postcode at a time");
    const change: repo.DistanceChange = body.distance.source === "manual" ? { source: "manual", km: kmOf(body.distance.km) } : { source: "computed" };
    const res = await repo.setDistance(postcodes[0]!, change, sub);
    if (res === "not_listed") throw new CoverageError(404, "not_listed", "that postcode is not on the list");
    if (res === "not_computable") {
      throw new CoverageError(409, "distance_not_computable", "no place in this postcode has a known location, so its distance cannot be worked out");
    }
  }
  if (movesGroup) {
    const groupId = await groupOf(body.groupId);
    await requireDrivers(groupId, body.confirmNoDrivers);
    await repo.assignGroup(postcodes, groupId, sub);
  }
  await changed();
}

// ── groups ──────────────────────────────────────────────────────────────────────────────────────

export async function createGroup(body: { name?: unknown }, sub: string): Promise<{ id: string }> {
  const name = nameOf(body?.name);
  if (await repo.groupNameTaken(name, null)) throw new CoverageError(409, "group_name_taken", "there is already a group with that name");
  const id = await repo.createGroup(name, sub);
  await changed();
  return { id };
}

export async function renameGroup(id: string, body: { name?: unknown }, sub: string): Promise<void> {
  const groupId = await groupOf(id);
  if (!groupId) throw new CoverageError(404, "group_not_found", "that group no longer exists");
  const name = nameOf(body?.name);
  if (await repo.groupNameTaken(name, groupId)) throw new CoverageError(409, "group_name_taken", "there is already a group with that name");
  await repo.renameGroup(groupId, name, sub);
  await changed();
}

/** Its postcodes stay listed, in no group (FR-015) — so they need a driver cleared for everywhere. */
export async function removeGroup(id: string, confirmNoDrivers: boolean, sub: string): Promise<{ ungrouped: number }> {
  const groupId = await groupOf(id);
  if (!groupId) throw new CoverageError(404, "group_not_found", "that group no longer exists");
  await requireDrivers(null, confirmNoDrivers);
  const ungrouped = await repo.removeGroup(groupId, sub);
  await changed();
  return { ungrouped };
}

// ── courier reach ───────────────────────────────────────────────────────────────────────────────

export async function setCourier(body: { offered?: unknown }, sub: string): Promise<{ offered: boolean }> {
  if (typeof body?.offered !== "boolean") throw new CoverageError(400, "invalid_request", "offered must be true or false");
  // ⚠ See COURIER_ORDERING_AVAILABLE: on, every unlisted address in the country would be told
  // "Courier delivery" by a checkout that cannot sell one.
  if (body.offered && !COURIER_ORDERING_AVAILABLE) {
    throw new CoverageError(409, "courier_ordering_unavailable", "courier delivery can be switched on once customers can place courier orders");
  }
  await repo.setCourierOffered(body.offered, sub);
  await changed();
  return { offered: body.offered };
}

export async function addExclusion(body: { postcode?: unknown; reason?: unknown }, sub: string): Promise<void> {
  const postcode = postcodeOf(body?.postcode);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 200) throw new CoverageError(422, "reason_required", "say why, in 3 to 200 characters");
  if (!(await repo.postcodeFacts([postcode])).get(postcode)?.known) {
    throw new CoverageError(422, "unknown_postcode", "not a known postcode", { postcodes: [postcode] });
  }
  if (!(await repo.addExclusion(postcode, reason, sub))) throw new CoverageError(409, "already_excluded", "that postcode is already excluded");
  await changed();
}

export async function removeExclusion(postcode: string, sub: string): Promise<void> {
  if (!(await repo.removeExclusion(postcodeOf(postcode), sub))) throw new CoverageError(404, "not_excluded", "that postcode is not excluded");
  await changed();
}
