// Repository for back-office driver management (056): raw parameterized SQL, no ORM.
//
// Replaces apis/edge-api/admin/src/drivers/repository.ts, which was 049's minimal provisioning
// adjunct. Three of its behaviours are deliberately NOT carried over, each because it was a defect:
//
//   1. `ON CONFLICT (cognito_sub) DO UPDATE` on create — which made "add a driver" silently edit an
//      existing one (FR-014; now a refusal, and the refusal is a DATABASE guarantee via the citext
//      UNIQUE index that has been on work_email since 049).
//   2. `COALESCE($n, col)` on update — which cannot distinguish "leave alone" from "clear", so a
//      zone once assigned could never be un-assigned (FR-010).
//   3. `ORDER BY d.name ASC` with no limit and no search — the whole table, always (FR-003/FR-004).
import { query, withTransaction } from "@effy/edge-shared";
import type {
  AdminDriverListItem,
  AdminDriverProfile,
  DriverBlockedReason,
  DriverEmploymentStatus,
} from "@effy/shared-types";
import type pg from "pg";

import { BLOCKED_REASONS, ON_DUTY_EXISTS } from "./sql";

// ── Row shapes (data layer only — never leak past the mapper, Principle VI) ───────────────────────

interface ListRow {
  id: string;
  name: string;
  work_email: string;
  zone_id: string | null;
  zone_name: string | null;
  on_duty: boolean;
  status: DriverEmploymentStatus;
  blocked: string[];
}

interface ProfileRow extends ListRow {
  contact_phone: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  licence_reference: string | null;
  licence_expires_on: Date | null;
  vehicle_registration_expires_on: Date | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status_reason: string | null;
  status_changed_at: Date;
  started_on: Date | null;
  notes: string | null;
  /** Text, not Date — see the to_char in PROFILE_SELECT. */
  updated_at: string;
  hub_label: string | null;
}

/** `date` columns come back as a Date at local midnight; only the calendar day is meaningful. */
function dateOnly(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toListItem(r: ListRow): AdminDriverListItem {
  return {
    id: r.id,
    name: r.name,
    workEmail: r.work_email,
    zone: r.zone_name,
    zoneId: r.zone_id,
    dutyState: r.on_duty ? "on_duty" : "off_duty",
    status: r.status,
    blockedReasons: (r.blocked ?? []) as DriverBlockedReason[],
  };
}

const LIST_SELECT = `
  SELECT d.id,
         d.name,
         d.work_email,
         d.delivery_zone_id AS zone_id,
         z.name             AS zone_name,
         ${ON_DUTY_EXISTS}  AS on_duty,
         d.status,
         ${BLOCKED_REASONS} AS blocked
    FROM public.driver d
    LEFT JOIN public.delivery_zone z ON z.id = d.delivery_zone_id
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

/**
 * The register (FR-002…FR-005).
 *
 * ⚠ KEYSET PAGING ON `(name, id)`, AND THE CURSOR IS MINTED FROM THE SAME EXPRESSION. 053's order
 * list ordered and filtered on `created_at` but minted its cursor from `placed_at` — always the later
 * instant — so paging RE-SHOWED ROWS. Its first test passed with the defect in place because it
 * called the repository directly and supplied its own cursor, never touching the service where the
 * cursor is minted. `(name, id)` is a total order (id breaks ties on duplicate names), so no row can
 * be skipped or repeated.
 */
export async function listDrivers(params: ListParams): Promise<ListResult> {
  const where: string[] = [];
  const args: unknown[] = [];

  if (params.q) {
    args.push(`%${params.q}%`);
    // ILIKE on both, backed by the trigram index on name; work_email is citext so ILIKE is
    // case-insensitive by the column's own semantics rather than by the operator's.
    where.push(`(d.name ILIKE $${args.length} OR d.work_email ILIKE $${args.length})`);
  }
  if (params.statuses && params.statuses.length > 0) {
    args.push(params.statuses);
    where.push(`d.status = ANY($${args.length}::text[])`);
  } else if (!params.includeOffboarded) {
    // FR-005 — a register full of people who left is a register nobody reads.
    where.push(`d.status <> 'offboarded'`);
  }
  if (params.zoneId) {
    args.push(params.zoneId);
    where.push(`d.delivery_zone_id = $${args.length}`);
  }
  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      args.push(decoded.name, decoded.id);
      where.push(`(d.name, d.id) > ($${args.length - 1}, $${args.length}::uuid)`);
    }
  }

  // One extra row tells us whether another page exists without a second COUNT query.
  args.push(params.limit + 1);
  const sql = `${LIST_SELECT}
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY d.name ASC, d.id ASC
    LIMIT $${args.length}`;

  const res = await query<ListRow>(sql, args);
  const rows = res.rows.slice(0, params.limit);
  const hasMore = res.rows.length > params.limit;
  const last = rows[rows.length - 1];
  return {
    items: rows.map(toListItem),
    // ⚠ Minted from `name` and `id` — the SAME pair the ORDER BY and the WHERE use.
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
    // A malformed cursor restarts the listing rather than 500-ing. It can only come from a client
    // that mangled one we issued, and losing your place is a better outcome than an error page.
    return null;
  }
}

const PROFILE_SELECT = `
  SELECT d.id,
         d.name,
         d.work_email,
         d.contact_phone,
         d.delivery_zone_id AS zone_id,
         z.name             AS zone_name,
         d.vehicle_type,
         d.vehicle_plate,
         d.licence_reference,
         d.licence_expires_on,
         d.vehicle_registration_expires_on,
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
    LEFT JOIN public.delivery_zone z ON z.id = d.delivery_zone_id
   WHERE d.id = $1
`;

/** The profile (FR-006). `accountState` is filled in by the service, which owns the identity read. */
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
    zoneId: r.zone_id,
    zone: r.zone_name,
    hub: r.hub_label,
    vehicle: { type: r.vehicle_type, plate: r.vehicle_plate },
    credentials: {
      licenceReference: r.licence_reference,
      licenceExpiresOn: dateOnly(r.licence_expires_on),
      vehicleRegistrationExpiresOn: dateOnly(r.vehicle_registration_expires_on),
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

/** Find a driver by work email regardless of status — the duplicate check behind FR-014. */
export async function findByWorkEmail(
  email: string,
): Promise<{ id: string; name: string; status: DriverEmploymentStatus } | null> {
  const res = await query<{ id: string; name: string; status: DriverEmploymentStatus }>(
    `SELECT id, name, status FROM public.driver WHERE work_email = $1`,
    [email],
  );
  return res.rows[0] ?? null;
}

// ── Writes ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The mutable columns, mapped from DTO key → column name.
 *
 * ⚠ A KEY'S PRESENCE IN THE PATCH IS THE SIGNAL, NOT ITS VALUE. This map is what lets the update
 * distinguish "absent → leave alone" from "null → clear" (FR-010). `COALESCE($n, col)` collapses
 * those two into one, which is why a zone could never be un-assigned before this.
 *
 * ⚠ `work_email` is absent: it is the identity key (research R7).
 */
const MUTABLE_COLUMNS: Record<string, string> = {
  name: "name",
  contactPhone: "contact_phone",
  zoneId: "delivery_zone_id",
  vehicleType: "vehicle_type",
  vehiclePlate: "vehicle_plate",
  licenceReference: "licence_reference",
  licenceExpiresOn: "licence_expires_on",
  vehicleRegistrationExpiresOn: "vehicle_registration_expires_on",
  emergencyContactName: "emergency_contact_name",
  emergencyContactPhone: "emergency_contact_phone",
  startedOn: "started_on",
  notes: "notes",
};

/** uuid and date columns need an explicit cast when the value can be null. */
const COLUMN_CAST: Record<string, string> = {
  delivery_zone_id: "::uuid",
  licence_expires_on: "::date",
  vehicle_registration_expires_on: "::date",
  started_on: "::date",
};

export type UpdateOutcome = "updated" | "not_found" | "stale";

/**
 * Apply a patch under optimistic concurrency.
 *
 * Returns `stale` when the row exists but `updated_at` has moved — someone else saved first, and the
 * spec's edge case requires that the second save be refused rather than silently discard the first.
 */
export async function updateDriver(
  id: string,
  patch: Record<string, unknown>,
  expectedUpdatedAt: string,
): Promise<UpdateOutcome> {
  const sets: string[] = [];
  const args: unknown[] = [id, expectedUpdatedAt];

  for (const [key, column] of Object.entries(MUTABLE_COLUMNS)) {
    // `in` — not a truthiness check. A key present with `null` MUST reach the SET clause.
    if (!(key in patch)) continue;
    args.push(patch[key]);
    sets.push(`${column} = $${args.length}${COLUMN_CAST[column] ?? ""}`);
  }

  if (sets.length === 0) {
    // Nothing to change. Still distinguish "no such driver" from "nothing asked for".
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

/**
 * Insert a new driver record.
 *
 * ⚠ A PLAIN INSERT. No `ON CONFLICT` clause — a duplicate must raise, so the service can turn it into
 * FR-014's named refusal. The upsert this replaces is exactly how "add a new driver" became "edit
 * whoever already has that email", silently and with a success response.
 */
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

export interface HeldWork {
  kind: "collection" | "delivery";
  taskId: string;
  taskStatus: string;
  orderId: string;
  orderReference: string;
  location: string | null;
}

/**
 * Work this driver has already picked up or started, which standing them down would strand (FR-020).
 *
 * ⚠ This is the SAME condition the stranded-work reader uses, minus the ineligibility term — because
 * here we are asking "what WOULD be stranded if we did this", before the driver becomes ineligible.
 */
export async function heldWorkFor(driverId: string): Promise<HeldWork[]> {
  const res = await query<{
    kind: "collection" | "delivery";
    task_id: string;
    task_status: string;
    order_id: string;
    order_reference: string;
    location: string | null;
  }>(
    `SELECT 'collection'::text AS kind, ct.id AS task_id, ct.status AS task_status,
            sf.order_id, o.order_number AS order_reference, sh.name AS location
       FROM public.collection_task ct
       JOIN public.driver_run r        ON r.id = ct.run_id
       JOIN public.shop_fulfillment sf ON sf.id = ct.shop_fulfillment_id
       JOIN public."order" o           ON o.id = sf.order_id
       LEFT JOIN public.shop sh        ON sh.id = ct.shop_id
      WHERE r.driver_id = $1
        AND ct.status IN ('collected', 'short')
        AND r.status NOT IN ('completed', 'cancelled')
      UNION ALL
     SELECT 'delivery'::text, dt.id, dt.status,
            dt.order_id, o.order_number, ca.city
       FROM public.delivery_task dt
       JOIN public.driver_run r  ON r.id = dt.run_id
       JOIN public."order" o     ON o.id = dt.order_id
       LEFT JOIN public.customer_address ca ON ca.id = dt.customer_address_id
      WHERE r.driver_id = $1
        AND dt.status IN ('out_for_delivery', 'en_route', 'arrived')`,
    [driverId],
  );
  return res.rows.map((r) => ({
    kind: r.kind,
    taskId: r.task_id,
    taskStatus: r.task_status,
    orderId: r.order_id,
    orderReference: r.order_reference,
    location: r.location,
  }));
}

/** Apply an employment status transition and audit it, in one transaction. */
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
