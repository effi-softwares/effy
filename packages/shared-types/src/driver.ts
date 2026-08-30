/**
 * Driver app contracts — 049-driver-mobile-app.
 *
 * The wire shapes the driver mobile app exchanges with the cold-path driver service (`/driver/v1/*`).
 * DTO SSOT (Principle II): the driver app's Kotlin types are generated from these, never hand-defined.
 *
 * Hub-and-spoke model (CLAUDE.md "Driver logistics model"): a driver runs a COLLECTION run
 * (shops → hub), CHECKS IN at the hub (the same-day/standard split, known from checkout), then runs a
 * SAME-DAY DELIVERY run (hub → customers) closed with proof. Standard packages leave the app at hub
 * check-in.
 *
 * Two rules encoded structurally rather than left to handler discipline:
 *  1. NO monetary field appears in ANY type here — the driver never sees currency (FR-013). Every
 *     number on the wire is a COUNT, typed `WireInt` so the wire carries an integer, never `1.0`
 *     (the 027 R13 lesson, pinned by a Go/Node↔Kotlin contract test).
 *  2. NO driver identifier appears in any REQUEST — a driver's scope is resolved server-side from the
 *     access token's subject, so cross-driver access is un-representable on the wire (FR-012, SC-008).
 *
 * Contract detail: specs/049-driver-mobile-app/contracts/driver-api.contract.md
 */

// A wire integer (no decimal point on the wire) — the single definition lives in cart.ts.
import type { WireInt } from "./cart";

// ── Identity & duty ──────────────────────────────────────────────────────────────────────────────

export type DriverDutyStatus = "on_duty" | "off_duty";

export interface DriverVehicle {
  type: string | null;
  plate: string | null;
}

/** GET /driver/v1/me — the record-backed identity read. Display strings only; no currency. */
export interface DriverMeDTO {
  id: string;
  name: string;
  workEmail: string;
  zone: string | null; // display name of the assigned delivery zone; null until provisioned
  hub: string | null; // display label of the central hub (from delivery_settings)
  vehicle: DriverVehicle;
  dutyStatus: DriverDutyStatus;
}

/** POST /driver/v1/duty */
export interface DutyRequest {
  onDuty: boolean;
  changeId: string;
}
export interface DutyResponse {
  dutyStatus: DriverDutyStatus;
  since: string | null; // ISO 8601; null when off duty
}

/** POST /driver/v1/location — optional point-in-time snapshot (never streamed). */
export interface LocationRequest {
  lat: number;
  lng: number;
  changeId: string;
}

// ── Today (phase-aware home) ─────────────────────────────────────────────────────────────────────

export type DriverPhase = "collection" | "same_day_delivery" | "idle";

/** A compact reference to the active/queued work item shown on the home. */
export interface TodayItemRef {
  kind: "collection_stop" | "delivery_drop";
  id: string;
  runId: string;
  title: string; // shop name or customer suburb — no address detail, no currency
  subtitle: string | null;
  status: string;
}

/** GET /driver/v1/today */
export interface TodayDTO {
  phase: DriverPhase;
  activeRunId: string | null;
  active: TodayItemRef | null;
  upNext: TodayItemRef[];
  remainingCount: WireInt; // stops/drops remaining today — a count, never currency
}

// ── Phase 1 — collection run ─────────────────────────────────────────────────────────────────────
//
// A STOP is a shop within a run — it may hold several packages (one per order at that shop). The stop
// is the unit the driver collects in one action. `stopId` is the shop id scoped to the run.
// ⚠ The `shop` table stores no street address (deliberately minimal, 007), so a stop shows the shop
// NAME + CODE only; a `shop.address` column is a recorded follow-up (FR-013's "address").

export type CollectionStopStatus = "assigned" | "en_route" | "collected" | "short";

export interface CollectionStopSummary {
  stopId: string; // the shop id within this run
  sequence: WireInt;
  shopName: string;
  shopCode: string;
  packageCount: WireInt;
  status: CollectionStopStatus;
}

/** GET /driver/v1/collection/runs/{runId} (driver-facing; distinct from 047's admin CollectionRunDTO) */
export interface DriverCollectionRunDTO {
  runId: string;
  status: string;
  stops: CollectionStopSummary[];
}

export type PackageMethod = "same_day" | "standard";

export interface ManifestLine {
  name: string;
  qty: WireInt;
}

export interface CollectionPackage {
  ref: string; // the order number the package belongs to
  destinationSuburb: string;
  method: PackageMethod;
  items: ManifestLine[];
}

/** GET /driver/v1/collection/runs/{runId}/stops/{stopId} — a shop stop and its packages. */
export interface CollectionStopDTO {
  stopId: string;
  shopName: string;
  shopCode: string;
  packages: CollectionPackage[];
  status: CollectionStopStatus;
}

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect — collect all this shop's packages. */
export interface CollectRequest {
  changeId: string;
}
export interface CollectResponse {
  status: "collected";
}

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue — report a missing/short package. */
export interface CollectionIssueRequest {
  shopFulfillmentId?: string; // the specific package (order at this shop); optional
  kind: "missing" | "short";
  note?: string;
  changeId: string;
}

// ── The pivot — hub check-in ─────────────────────────────────────────────────────────────────────

/** POST /driver/v1/hub/checkin */
export interface HubCheckinRequest {
  runId: string;
  changeId: string;
}
export interface HubCheckinResponse {
  scannedTotal: WireInt;
  sameDayCount: WireInt;
  standardCount: WireInt; // staged for the external carrier; leaves the driver's active work
}

// ── Phase 2 — same-day delivery run ──────────────────────────────────────────────────────────────

export type DeliveryDropStatus =
  | "staged"
  | "out_for_delivery"
  | "en_route"
  | "arrived"
  | "delivered"
  | "failed";

export interface DeliveryDropSummary {
  dropId: string;
  sequence: WireInt;
  orderRef: string;
  customerSuburb: string;
  packageCount: WireInt;
  window: string | null;
  status: DeliveryDropStatus;
}

/** GET /driver/v1/delivery/runs/{runId} */
export interface DeliveryRunDTO {
  runId: string;
  status: string;
  drops: DeliveryDropSummary[];
}

export interface DropPackageRef {
  ref: string;
  fromShopCount: WireInt; // how many shops contributed — never shop identity
}

/** GET /driver/v1/delivery/drops/{dropId} */
export interface DeliveryDropDTO {
  dropId: string;
  orderRef: string;
  customerName: string;
  addressFull: string;
  instructions: string | null;
  packages: DropPackageRef[];
  status: DeliveryDropStatus;
}

/** POST /driver/v1/delivery/drops/{dropId}/status */
export interface DropStatusRequest {
  to: "out_for_delivery" | "en_route" | "arrived";
  changeId: string;
}
export interface DropStatusResponse {
  status: DeliveryDropStatus;
}

export type ProofMethod = "photo" | "code" | "signature" | "contactless";

/** POST /driver/v1/delivery/drops/{dropId}/proof/presign */
export interface ProofPresignRequest {
  contentType: string;
  fileSize: WireInt;
  changeId: string;
}
export interface ProofPresignResponse {
  uploadUrl: string;
  mediaKey: string;
}

/** POST /driver/v1/delivery/drops/{dropId}/proof */
export interface ProofRequest {
  method: ProofMethod;
  mediaKey?: string; // photo/signature
  code?: string; // code
  note?: string;
  changeId: string;
}
export interface ProofResponse {
  status: "delivered";
}

export type DeliveryFailureReason =
  | "nobody_home"
  | "wrong_address"
  | "customer_refused"
  | "access_blocked"
  | "other";

/** POST /driver/v1/delivery/drops/{dropId}/fail */
export interface DropFailRequest {
  reason: DeliveryFailureReason;
  note?: string;
  changeId: string;
}
export interface DropFailResponse {
  status: "failed";
}

// ── Map (US4) ────────────────────────────────────────────────────────────────────────────────────

export interface MapPoint {
  lat: number;
  lng: number;
}
export interface MapStop {
  id: string;
  kind: "shop" | "drop" | "hub";
  lat: number;
  lng: number;
  sequence: WireInt;
}

/** GET /driver/v1/runs/{runId}/map */
export interface RunMapDTO {
  hub: MapPoint;
  stops: MapStop[];
  currentLocation: MapPoint | null;
}

/** POST /driver/v1/delivery/drops/{dropId}/contact — masked relay (capability-flagged, R6). */
export interface ContactRequest {
  mode: "call" | "message";
  changeId: string;
}
export interface ContactResponse {
  maskedChannel: string;
}

// ── History & activity ───────────────────────────────────────────────────────────────────────────

export interface HistoryDropRow {
  dropId: string;
  orderRef: string;
  customerSuburb: string;
  completedAt: string; // ISO 8601
  proofCaptured: boolean;
}
/**
 * The two kinds of work a driver run can be. Named as a type by 056 because back-office reads it too
 * — it was an inline union used once, and a second consumer is exactly when a concept earns a name
 * (Principle II: one definition per concept, not one per file).
 *
 * ⚠ Work is TYPED TASKS, NOT DRIVER ROLES. One driver typically runs a collection round and then a
 * same-day round in the same shift; neither is a role they hold.
 */
export type DriverRunType = "collection" | "same_day_delivery";

export interface HistoryRunRow {
  runId: string;
  type: DriverRunType;
  completedAt: string | null;
  stopCount: WireInt;
}
export interface HistoryDay {
  date: string; // YYYY-MM-DD (Australia/Melbourne)
  runs: HistoryRunRow[];
  drops: HistoryDropRow[];
}
/** GET /driver/v1/history */
export interface HistoryDTO {
  days: HistoryDay[];
}

export interface TimelineEntry {
  status: string;
  at: string; // ISO 8601
}
/** GET /driver/v1/history/{kind}/{id} */
export interface HistoryDetailDTO {
  timeline: TimelineEntry[];
  proof: {
    method: ProofMethod;
    mediaUrl: string | null; // signed GET; null for code/contactless
    note: string | null;
    capturedAt: string;
  } | null;
  addressFull: string | null;
  packages: DropPackageRef[];
}

export type ActivityType =
  | "run_assigned"
  | "packages_ready"
  | "sameday_window"
  | "reminder"
  | "issue_ack"
  | "cutoff_missed";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  body: string;
  createdAt: string;
  read: boolean;
  runId: string | null;
  dropId: string | null;
}
/** GET /driver/v1/activity */
export type ActivityDTO = ActivityItem[];

/** POST /driver/v1/activity/read */
export interface ActivityReadRequest {
  ids: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Back-office fleet management — /fleet/v1/* (056-driver-management)
// contract: specs/056-driver-management/contracts/fleet-api.contract.md
//
// ⚠ THESE TYPES ARE BACK-OFFICE-ONLY AND ARE NOT CONSUMED BY THE DRIVER APP. They live in this file
// rather than a new one because they describe the SAME entity the file above describes — Principle II
// is about one definition per concept, not one file per audience. `apps/driver-mobile` has no
// generated contract directory and no drift guard (only cm-/sm- targets exist in the Makefile), so
// nothing here regenerates Kotlin.
//
// Two rules carry over from the driver block above and are just as binding here:
//  1. NO monetary field appears anywhere (FR-049). The driver domain has never carried money and
//     back-office does not introduce it — an order's money lives on the order screens these link to.
//  2. Every count is `WireInt`, so the wire carries an integer and never `1.0`. That rule is about
//     the CONTRACT, not about who happens to read it today (the 027 R13 lesson).
//
// One rule is new, and it is about PII rather than shape:
//  3. A driver's phone, emergency contact and licence reference appear on the PROFILE type only.
//     They are absent from every list, exception, duty and history type, so a screen that shows many
//     drivers cannot leak a contact detail it never needed (FR-050).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Employment lifecycle. ⚠ WIDENED FROM `active | disabled` BY 056.
 *
 * `suspended` is a temporary stand-down: retained, no access, no work, restorable.
 * `offboarded` is permanent: retained for audit, permanently no access.
 *
 * Conflating them — which is what `disabled` did — makes the register unusable for either, because
 * "is this person coming back?" is the only question an operator actually has about a driver who is
 * not working today.
 */
export type DriverEmploymentStatus = "active" | "suspended" | "offboarded";

/** ⚠ Retained name for the driver app's own `/driver/v1/me` payload; same three values. */
export type DriverStatus = DriverEmploymentStatus;

/** Why a driver cannot be given work. An enumerated cause, never a bare boolean — "cannot work"
 *  without "why" is not actionable, and the fix differs per cause (FR-044). */
export type DriverBlockedReason = "no_zone" | "suspended" | "offboarded" | "licence_expired";

/** Whether the platform record and the sign-in account agree (FR-006, spec edge case).
 *  `record_only` / `identity_only` mean provisioning half-succeeded — the profile must SHOW that
 *  rather than render a half-working driver as normal. */
export type DriverAccountState = "ok" | "record_only" | "identity_only";

export type DriverDutyState = "on_duty" | "off_duty";

// ── Register ─────────────────────────────────────────────────────────────────────────────────────

/** One row of the register (FR-002). ⚠ Deliberately carries NO contact detail (FR-050). */
export interface AdminDriverListItem {
  id: string;
  name: string;
  workEmail: string;
  zone: string | null;
  zoneId: string | null;
  dutyState: DriverDutyState;
  status: DriverEmploymentStatus;
  /** Empty when the driver can receive work. Populated causes are shown inline (FR-044, SC-009). */
  blockedReasons: DriverBlockedReason[];
}

export interface AdminDriverListResponse {
  items: AdminDriverListItem[];
  /** ⚠ Must be consumed by the UI. 053 shipped a console that ignored its own nextCursor and was
   *  silently capped at the newest 25 rows. */
  nextCursor: string | null;
}

// ── Profile of record ────────────────────────────────────────────────────────────────────────────

export interface AdminDriverCredentials {
  licenceReference: string | null;
  licenceExpiresOn: string | null;
  vehicleRegistrationExpiresOn: string | null;
}

export interface AdminDriverEmergencyContact {
  name: string | null;
  phone: string | null;
}

/** The full profile (FR-006). ⚠ The ONLY type here carrying contact details. */
export interface AdminDriverProfile {
  id: string;
  name: string;
  workEmail: string;
  contactPhone: string | null;
  zoneId: string | null;
  zone: string | null;
  hub: string | null;
  vehicle: DriverVehicle;
  credentials: AdminDriverCredentials;
  emergencyContact: AdminDriverEmergencyContact;
  status: DriverEmploymentStatus;
  statusReason: string | null;
  statusChangedAt: string;
  startedOn: string | null;
  notes: string | null;
  dutyState: DriverDutyState;
  blockedReasons: DriverBlockedReason[];
  accountState: DriverAccountState;
  /** The optimistic-concurrency token. A PATCH must echo the value it loaded (FR: edge case
   *  "two operators edit the same driver at once"); a stale one is refused with a named 409. */
  updatedAt: string;
}

export interface AdminDriverCreateRequest {
  name: string;
  workEmail: string;
  contactPhone?: string | null;
  zoneId?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  licenceReference?: string | null;
  licenceExpiresOn?: string | null;
  vehicleRegistrationExpiresOn?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  startedOn?: string | null;
  notes?: string | null;
}

/**
 * ⚠ ABSENT IS NOT NULL, and that distinction is the whole point of FR-010.
 *
 * A key absent from the request leaves the column alone. A key present with `null` CLEARS it. The
 * predecessor used `COALESCE($n, col)`, which cannot tell the two apart — so a zone, once assigned,
 * could never be un-assigned by any request the API accepted.
 *
 * ⚠ `workEmail` is deliberately absent. It is the identity key: the sign-in account is created with
 * it as the username and the platform record joins on the `sub` that account returned, so changing it
 * is a re-provisioning, not an edit (research R7).
 */
export interface AdminDriverUpdateRequest {
  name?: string;
  contactPhone?: string | null;
  zoneId?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  licenceReference?: string | null;
  licenceExpiresOn?: string | null;
  vehicleRegistrationExpiresOn?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  startedOn?: string | null;
  notes?: string | null;
  /** Required. The `updatedAt` the profile was loaded with. */
  updatedAt: string;
}

export interface AdminDriverStatusRequest {
  status: DriverEmploymentStatus;
  reason: string;
  /** Set only after the operator has seen and accepted the held-work warning (FR-020). Without it,
   *  standing down a driver who is holding started work is refused with an itemised 409. */
  acknowledgeHeldWork?: boolean;
}

// ── Held / stranded work ─────────────────────────────────────────────────────────────────────────

export type StrandedWorkKind = "collection" | "delivery";

/**
 * Work claimed by a driver who is no longer eligible, which the automatic release sweep will NOT
 * reclaim because it has already been physically picked up or started (FR-021).
 *
 * ⚠ DERIVED ON READ, NEVER STORED. A stored flag and the task rows can disagree, and then nobody
 * knows which is true (027's counted-not-stored rule).
 */
export interface StrandedWork {
  kind: StrandedWorkKind;
  /** The collection_task id or the delivery_task id. */
  taskId: string;
  taskStatus: string;
  driverId: string;
  driverName: string;
  driverStatus: DriverEmploymentStatus;
  orderId: string;
  orderReference: string;
  /** The shop the package came from (collection), or the delivery suburb (delivery). */
  location: string | null;
  since: string;
}

export interface StrandedWorkResponse {
  items: StrandedWork[];
}

export interface StrandedReleaseRequest {
  collectionTaskIds?: string[];
  deliveryTaskIds?: string[];
  note: string;
}

export interface StrandedReleaseResponse {
  released: WireInt;
}

// ── Exceptions ───────────────────────────────────────────────────────────────────────────────────

export type DriverExceptionKind = "delivery_failure" | "collection_issue";

/**
 * An undeliverable drop, or a missing/short package reported at a shop (FR-027, FR-028).
 *
 * ⚠ The driver app has written both since 049 and NOTHING HAS EVER READ EITHER. Both tables carry a
 * comment saying they are "recorded for back-office follow-up"; this type is the follow-up.
 */
export interface DriverException {
  kind: DriverExceptionKind;
  id: string;
  /** delivery_failure: nobody_home | wrong_address | customer_refused | access_blocked | other.
   *  collection_issue: missing | short. */
  reason: string;
  note: string | null;
  driverId: string | null;
  driverName: string | null;
  orderId: string | null;
  orderReference: string | null;
  /** The delivery suburb (failure) or the shop name (collection issue). Never a full address —
   *  a queue screen does not need one, and it would put a customer's street on a list view. */
  location: string | null;
  occurredAt: string;
  resolvedAt: string | null;
  resolvedBySub: string | null;
  resolutionNote: string | null;
}

export interface DriverExceptionListResponse {
  items: DriverException[];
  nextCursor: string | null;
  /** Shown on entering the Drivers area (FR-032) — as a labelled figure in a section header, never
   *  a metric card (Principle V). */
  outstandingCount: WireInt;
}

export interface DriverExceptionResolveRequest {
  note: string;
}

// ── Duty ─────────────────────────────────────────────────────────────────────────────────────────

export interface OnDutyDriver {
  driverId: string;
  driverName: string;
  zone: string | null;
  sessionId: string;
  onDutySince: string;
  /** Null when on duty with nothing assigned — which is itself worth seeing. */
  currentRunId: string | null;
  currentRunType: DriverRunType | null;
  completedStops: WireInt;
  totalStops: WireInt;
  nextStop: string | null;
  /** True when the session has been open longer than the configured threshold (FR-037). */
  overdue: boolean;
}

/**
 * Work that is ready and has no driver (FR-036).
 *
 * ⚠ Computed with the assignment sweep's OWN candidate predicate, shared as a SQL constant. If the
 * console derived it independently the screen would eventually be confidently wrong about the one
 * question it exists to answer — "why is nothing moving?".
 */
export interface UnassignedWorkSummary {
  readyToCollect: WireInt;
  readyToDeliver: WireInt;
  driversOnDuty: WireInt;
}

export interface DutyResponseAdmin {
  onDuty: OnDutyDriver[];
  unassigned: UnassignedWorkSummary;
}

// ── Work history ─────────────────────────────────────────────────────────────────────────────────

export interface DriverRunSummary {
  runId: string;
  type: DriverRunType;
  status: string;
  businessDate: string;
  assignedAt: string;
  completedAt: string | null;
  completedStops: WireInt;
  totalStops: WireInt;
}

export interface DriverRunStop {
  taskId: string;
  kind: StrandedWorkKind;
  sequence: WireInt;
  label: string;
  status: string;
  orderId: string | null;
  orderReference: string | null;
  /** The append-only status timeline for this stop, oldest first (FR-040). */
  timeline: { status: string; at: string }[];
  /** Delivery stops only, and only once delivered. */
  hasProof: boolean;
}

export interface DriverRunDetail {
  run: DriverRunSummary;
  driverId: string;
  driverName: string;
  stops: DriverRunStop[];
}

/** Counts over a chosen period (FR-043). ⚠ Counts only — this is not a timesheet and carries no
 *  currency, no hours-for-payment and no rate. */
export interface DriverPeriodSummary {
  from: string;
  to: string;
  daysWorked: WireInt;
  runsCompleted: WireInt;
  packagesCollected: WireInt;
  dropsDelivered: WireInt;
  dropsFailed: WireInt;
}

export interface DriverHistoryResponse {
  items: DriverRunSummary[];
  nextCursor: string | null;
  summary: DriverPeriodSummary;
}

/** Proof of delivery for one drop (FR-041).
 *  ⚠ `mediaUrl` is a TIME-LIMITED presigned URL, never a durable address, and issuing it is audited. */
export interface DriverProofResponse {
  method: ProofMethod;
  mediaUrl: string | null;
  note: string | null;
  capturedAt: string;
  capturedByDriverId: string | null;
  capturedByDriverName: string | null;
}

// ── Audit ────────────────────────────────────────────────────────────────────────────────────────

export interface DriverAuditEntry {
  id: string;
  actorSub: string;
  action: string;
  /** ⚠ Never carries a phone, emergency contact or licence reference — the audit writer records a
   *  redacted field as CHANGED and nothing more (FR-050). */
  detail: Record<string, unknown>;
  at: string;
}

export interface DriverAuditResponse {
  items: DriverAuditEntry[];
}

// ── Readiness ────────────────────────────────────────────────────────────────────────────────────

export interface BlockedDriver {
  driverId: string;
  driverName: string;
  reasons: DriverBlockedReason[];
}

export interface ZoneCoverage {
  zoneId: string;
  zoneName: string;
  activeDrivers: WireInt;
}

export type ExpiringCredentialKind = "licence" | "vehicle_registration";

export interface ExpiringCredential {
  driverId: string;
  driverName: string;
  kind: ExpiringCredentialKind;
  expiresOn: string;
  expired: boolean;
}

export interface FleetReadinessResponse {
  blocked: BlockedDriver[];
  uncoveredZones: ZoneCoverage[];
  expiring: ExpiringCredential[];
}
