// No upsert on create (a duplicate is refused, by the citext unique on work_email), presence-based
// updates (absent leaves alone, null clears), and a paged, searchable register.
import { query, withTransaction } from "@effy/edge-shared";
import type {
  AdminDriverCredentials,
  DriverCapabilitySummary,
  AdminDriverListItem,
  AdminDriverProfile,
  DriverBlockedReason,
  DriverEmploymentStatus,
} from "@effy/shared-types";
import type pg from "pg";

import { listForDriver, summariseForDrivers } from "../capabilities/repository";
import { BLOCKED_REASONS, ON_DUTY_EXISTS } from "./sql";

interface ListRow {
  id: string;
  name: string;
  work_email: string;
  on_duty: boolean;
  status: DriverEmploymentStatus;
  blocked: string[];
}

interface ProfileRow extends ListRow {
  contact_phone: string | null;
  licence_class: string | null;
  licence_reference: string | null;
  held_vehicle_type: string | null;
  held_vehicle_plate: string | null;
  licence_expires_on: Date | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status_reason: string | null;
  status_changed_at: Date;
  started_on: Date | null;
  notes: string | null;
  /** Text, not Date (see the to_char in PROFILE_SELECT). */
  updated_at: string;
  hub_label: string | null;
}

/** Only the calendar day is meaningful. */
function dateOnly(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Filled in by the caller in one batched read: a summary, never the full clearance set. */
function toListItem(r: ListRow, summary: DriverCapabilitySummary): AdminDriverListItem {
  return {
    id: r.id,
    name: r.name,
    workEmail: r.work_email,
    capabilitySummary: summary,
    dutyState: r.on_duty ? "on_duty" : "off_duty",
    status: r.status,
    blockedReasons: (r.blocked ?? []) as DriverBlockedReason[],
  };
}

const EMPTY_SUMMARY: DriverCapabilitySummary = {
  total: 0,
  coversEveryZone: false,
  functions: [],
};

const LIST_SELECT = `
  SELECT d.id,
         d.name,
         d.work_email,
         ${ON_DUTY_EXISTS}  AS on_duty,
         d.status,
         ${BLOCKED_REASONS} AS blocked
    FROM public.driver d
`;

export interface ListParams {
  q?: string;
  statuses?: DriverEmploymentStatus[];
  zoneId?: string;
  includeOffboarded?: boolean;
  cursor?: string;
  limit: number;
}

export interface ListResult {
  items: AdminDriverListItem[];
  nextCursor: string | null;
}

/** Keyset paging on `(name, id)`, a total order, with the cursor minted from the same pair. */
export async function listDrivers(params: ListParams): Promise<ListResult> {
  const where: string[] = [];
  const args: unknown[] = [];

  if (params.q) {
    args.push(`%${params.q}%`);
    // ILIKE on both (trigram index on name; work_email is citext).
    where.push(`(d.name ILIKE $${args.length} OR d.work_email ILIKE $${args.length})`);
  }
  if (params.statuses && params.statuses.length > 0) {
    args.push(params.statuses);
    where.push(`d.status = ANY($${args.length}::text[])`);
  } else if (!params.includeOffboarded) {
    // Leavers are hidden by default.
    where.push(`d.status <> 'offboarded'`);
  }
  if (params.zoneId) {
    // "Cleared for this zone" includes every-zone drivers.
    args.push(params.zoneId);
    where.push(`EXISTS (
      SELECT 1 FROM public.driver_zone_capability fc
       WHERE fc.driver_id = d.id AND (fc.zone_id = $${args.length} OR fc.zone_id IS NULL)
    )`);
  }
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      args.push(decoded.name, decoded.id);
      where.push(`(d.name, d.id) > ($${args.length - 1}, $${args.length}::uuid)`);
    }
  }

  args.push(params.limit + 1);
  const sql = `${LIST_SELECT}
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY d.name ASC, d.id ASC
    LIMIT $${args.length}`;

  const res = await query<ListRow>(sql, args);
  const rows = res.rows.slice(0, params.limit);
  const hasMore = res.rows.length > params.limit;
  const last = rows[rows.length - 1];
  // One batched read for the page, not one per row.
  const summaries = await summariseForDrivers(rows.map((r) => r.id));
  return {
    items: rows.map((r) => toListItem(r, summaries.get(r.id) ?? EMPTY_SUMMARY)),
    nextCursor: hasMore && last ? encodeCursor(last.name, last.id) : null,
  };
}

export function encodeCursor(name: string, id: string): string {
  return Buffer.from(JSON.stringify({ n: name, i: id }), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): { name: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      n?: unknown;
      i?: unknown;
    };
    if (typeof parsed.n !== "string" || typeof parsed.i !== "string") return null;
    return { name: parsed.n, id: parsed.i };
  } catch {
    // A malformed cursor restarts the listing rather than 500-ing.
    return null;
  }
}

const PROFILE_SELECT = `
  SELECT d.id,
         d.name,
         d.work_email,
         d.contact_phone,
         d.licence_class,
         d.licence_reference,
         d.licence_expires_on,
         -- ⚠ what the driver is driving is the vehicle behind their OPEN holding. NULL when they hold nothing,
         -- which is an ordinary state.
         hv.body_type         AS held_vehicle_type,
         hv.registration_plate AS held_vehicle_plate,
         d.emergency_contact_name,
         d.emergency_contact_phone,
         d.status,
         d.status_reason,
         d.status_changed_at,
         d.started_on,
         d.notes,
         -- ⚠ MICROSECOND precision, rendered in UTC. Calling toISOString() on the Date
         -- pg returns would truncate to MILLISECONDS, and the equality guard below would
         -- then never match its own row: every save would report 'changed by someone else'
         -- and no profile edit could ever succeed. Caught by the container test; invisible
         -- to a mocked one, and invisible to tsc, because both sides are just strings.
         to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
         ${ON_DUTY_EXISTS}  AS on_duty,
         ${BLOCKED_REASONS} AS blocked,
         (SELECT 'Effy Hub' FROM public.delivery_settings LIMIT 1) AS hub_label
    FROM public.driver d
    -- ⚠ The OPEN holding is the single source of truth for "what does this driver have".
    -- There is deliberately no driver.current_vehicle_id: two places stating one fact disagree.
    LEFT JOIN public.vehicle_holding hh ON hh.driver_id = d.id AND hh.ended_at IS NULL
    LEFT JOIN public.vehicle hv         ON hv.id = hh.vehicle_id
   WHERE d.id = $1
`;

/** `accountState` is filled in by the service. */
export async function getDriver(
  id: string,
): Promise<(Omit<AdminDriverProfile, "accountState"> & { workEmail: string }) | null> {
  const res = await query<ProfileRow>(PROFILE_SELECT, [id]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    workEmail: r.work_email,
    contactPhone: r.contact_phone,
    hub: r.hub_label,
    capabilities: await listForDriver(id),
    vehicle: { type: r.held_vehicle_type, plate: r.held_vehicle_plate },
    credentials: {
      licenceReference: r.licence_reference,
      licenceExpiresOn: dateOnly(r.licence_expires_on),
      licenceClass: r.licence_class as AdminDriverCredentials["licenceClass"],
    },
    emergencyContact: { name: r.emergency_contact_name, phone: r.emergency_contact_phone },
    status: r.status,
    statusReason: r.status_reason,
    statusChangedAt: r.status_changed_at.toISOString(),
    startedOn: dateOnly(r.started_on),
    notes: r.notes,
    dutyState: r.on_duty ? "on_duty" : "off_duty",
    blockedReasons: (r.blocked ?? []) as DriverBlockedReason[],
    updatedAt: r.updated_at,
  };
}

/** Regardless of status: the duplicate check. */
export async function findByWorkEmail(
  email: string,
): Promise<{ id: string; name: string; status: DriverEmploymentStatus } | null> {
  const res = await query<{ id: string; name: string; status: DriverEmploymentStatus }>(
    `SELECT id, name, status FROM public.driver WHERE work_email = $1`,
    [email],
  );
  return res.rows[0] ?? null;
}

/** DTO key → column. A key's presence is the signal: absent leaves alone, null clears. `work_email` is the identity key and absent. */
const MUTABLE_COLUMNS: Record<string, string> = {
  name: "name",
  contactPhone: "contact_phone",
  licenceReference: "licence_reference",
  licenceExpiresOn: "licence_expires_on",
  licenceClass: "licence_class",
  emergencyContactName: "emergency_contact_name",
  emergencyContactPhone: "emergency_contact_phone",
  startedOn: "started_on",
  notes: "notes",
};

const COLUMN_CAST: Record<string, string> = {
  licence_expires_on: "::date",
  started_on: "::date",
};

export type UpdateOutcome = "updated" | "not_found" | "stale";

/** `stale` when `updated_at` has moved: the second save is refused, never silently discarding the first. */
export async function updateDriver(
  id: string,
  patch: Record<string, unknown>,
  expectedUpdatedAt: string,
): Promise<UpdateOutcome> {
  const sets: string[] = [];
  const args: unknown[] = [id, expectedUpdatedAt];

  for (const [key, column] of Object.entries(MUTABLE_COLUMNS)) {
    // `in`, not truthiness: a key present with null must reach the set clause.
    if (!(key in patch)) continue;
    args.push(patch[key]);
    sets.push(`${column} = $${args.length}${COLUMN_CAST[column] ?? ""}`);
  }

  if (sets.length === 0) {
    // Nothing to change; still tell "no such driver" from "nothing asked for".
    const exists = await query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.driver WHERE id = $1) AS ok`,
      [id],
    );
    return exists.rows[0]?.ok ? "updated" : "not_found";
  }

  sets.push("updated_at = now()");
  const res = await query<{ id: string }>(
    `UPDATE public.driver
        SET ${sets.join(", ")}
      WHERE id = $1 AND updated_at = $2::timestamptz
      RETURNING id`,
    args,
  );
  if ((res.rowCount ?? 0) > 0) return "updated";

  const exists = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.driver WHERE id = $1) AS ok`,
    [id],
  );
  return exists.rows[0]?.ok ? "stale" : "not_found";
}

export interface InsertDriverInput {
  sub: string;
  name: string;
  workEmail: string;
  profile: Record<string, unknown>;
}

/** A plain INSERT, so a duplicate raises and becomes a named refusal. */
export async function insertDriver(input: InsertDriverInput): Promise<string> {
  const columns = ["cognito_sub", "name", "work_email", "status", "status_changed_at"];
  const values = ["$1", "$2", "$3", "'active'", "now()"];
  const args: unknown[] = [input.sub, input.name, input.workEmail];

  for (const [key, column] of Object.entries(MUTABLE_COLUMNS)) {
    if (column === "name" || !(key in input.profile)) continue;
    args.push(input.profile[key]);
    columns.push(column);
    values.push(`$${args.length}${COLUMN_CAST[column] ?? ""}`);
  }

  const res = await query<{ id: string }>(
    `INSERT INTO public.driver (${columns.join(", ")}) VALUES (${values.join(", ")}) RETURNING id`,
    args,
  );
  return res.rows[0]!.id;
}

/** In one transaction with its audit row. */
export async function setStatus(
  id: string,
  status: DriverEmploymentStatus,
  reason: string,
  write: (tx: pg.PoolClient, driverId: string) => Promise<void>,
): Promise<string | null> {
  return withTransaction(async (tx) => {
    const res = await tx.query<{ work_email: string }>(
      `UPDATE public.driver
          SET status = $2, status_reason = $3, status_changed_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING work_email`,
      [id, status, reason],
    );
    const email = res.rows[0]?.work_email;
    if (!email) return null;
    await write(tx, id);
    return email;
  });
}
