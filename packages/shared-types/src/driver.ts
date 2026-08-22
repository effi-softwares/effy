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

export type CollectionTaskStatus = "assigned" | "en_route" | "collected" | "short";

export interface CollectionStopSummary {
  taskId: string;
  sequence: WireInt;
  shopName: string;
  shopAddress: string;
  packageCount: WireInt;
  status: CollectionTaskStatus;
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
  ref: string;
  destinationSuburb: string;
  method: PackageMethod;
  items: ManifestLine[];
}

/** GET /driver/v1/collection/tasks/{taskId} */
export interface CollectionTaskDTO {
  taskId: string;
  shopName: string;
  shopAddress: string;
  packages: CollectionPackage[];
  status: CollectionTaskStatus;
}

/** POST /driver/v1/collection/tasks/{taskId}/collect */
export interface CollectRequest {
  changeId: string;
}
export interface CollectResponse {
  status: "collected";
}

/** POST /driver/v1/collection/tasks/{taskId}/issue */
export interface CollectionIssueRequest {
  orderItemId?: string;
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
export interface HistoryRunRow {
  runId: string;
  type: "collection" | "same_day_delivery";
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

// ── Back-office driver provisioning — /admin/v1/drivers (contracts/admin-drivers.contract.md) ─────

export type DriverStatus = "active" | "disabled";

export interface AdminDriverRow {
  id: string;
  name: string;
  workEmail: string;
  zone: string | null;
  vehicle: DriverVehicle;
  status: DriverStatus;
}

export interface AdminDriverCreateRequest {
  name: string;
  workEmail: string;
  zoneId?: string;
  vehicleType?: string;
  vehiclePlate?: string;
}

export interface AdminDriverUpdateRequest {
  name?: string;
  zoneId?: string;
  vehicleType?: string;
  vehiclePlate?: string;
}

export interface AdminDriverStatusRequest {
  status: DriverStatus;
}
