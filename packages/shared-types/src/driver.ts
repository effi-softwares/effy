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

/**
 * What the driver is currently driving, for their own Account screen.
 *
 * ⚠ THE SHAPE IS UNCHANGED BY 061 AND THAT IS DELIBERATE — `apps/driver-mobile` renders it
 * (`DriverMappers.kt`, `AccountScreen.kt`) and it is part of the generated Kotlin contract. What
 * changed is where it COMES FROM: until 061 these were two free-text columns on the driver row that
 * nobody maintained; they are now read from the driver's open `vehicle_holding` and the real vehicle
 * behind it. The app shows a true answer without a single line of Kotlin changing.
 *
 * Both fields are null when the driver holds no vehicle, which is an ordinary state.
 */
export interface DriverVehicle {
  type: string | null;
  plate: string | null;
}

/** GET /driver/v1/me — the record-backed identity read. Display strings only; no currency. */
export interface DriverMeDTO {
  id: string;
  name: string;
  workEmail: string;
  /**
   * What the driver is cleared to cover, as one line for their own Account screen.
   *
   * ⚠ THE SHAPE IS UNCHANGED BY 062 AND THAT IS DELIBERATE — `apps/driver-mobile` renders it in three
   * places (Today, Help, Account) and it is part of the generated Kotlin contract. What changed is
   * where it COMES FROM: until 062 this was a single assigned zone that no assignment code ever read;
   * it is now DERIVED from the driver's clearances. The app tells the truth without a line of Kotlin
   * changing — the same move 061 made for `DriverVehicle`.
   *
   * null when the driver is cleared for nothing, which is an ordinary state for a new starter and one
   * the app already renders as unavailable rather than as a broken row.
   */
  zone: string | null;
  hub: string | null; // display label of the central hub (from delivery_settings)
  vehicle: DriverVehicle;
  dutyStatus: DriverDutyStatus;
}

/** POST /driver/v1/duty */
export interface DutyRequest {
  onDuty: boolean;
  changeId: string;
  /**
   * ⚠ 064, FR-018 — "I have seen what I am carrying and I am going off duty anyway."
   *
   * Going off duty with packages still in the van is REFUSED (409) until this is set, and the refusal
   * names every package. It is a confirmation, not a bypass: the requirement is that a shift cannot
   * end SILENTLY on a van with goods in it, not that it cannot end at all — a driver whose van is
   * genuinely empty, or who handed over some other way, says so and goes home.
   *
   * 056 found that standing a driver down could strand physical goods permanently and invisibly: the
   * release sweep deliberately never reclaims picked-up work, so nothing else would ever mention it.
   */
  acknowledgeHeldPackages?: boolean;
  /**
   * ⚠ OPTIONAL, AND ITS ABSENCE MEANS UNKNOWN (061, FR-032/FR-033).
   *
   * When a driver goes on duty they may say when they expect to finish. It buys nothing today — it
   * exists so the dispatch slice can ask "can this driver finish this round before they go home",
   * which is otherwise unanswerable.
   *
   * ⚠ IT MUST NEVER BE DEFAULTED TO A SHIFT LENGTH. An invented finish time would make a guess look
   * like a fact at exactly the moment it decides someone's workload — and the driver would be the
   * one who found out.
   */
  expectedEndAt?: string | null;
}
export interface DutyResponse {
  dutyStatus: DriverDutyStatus;
  since: string | null; // ISO 8601; null when off duty
  /** null = the driver did not say. Render as "unknown", never as a time. */
  expectedEndAt: string | null;
}

/** ⚠ `LocationRequest` STOOD HERE AND IS GONE (061) — see the note below. */
// ⚠ `LocationRequest` STOOD HERE AND IS GONE (061, FR-035/FR-036). Effy does not track driver
// position. It was a receiver with no sender — no caller in `apps/driver-mobile`, no location
// permission declared on either platform, no reader of the columns — and leaving it dormant is how
// 059's `device_token.platform` came to contradict the live contract for two years.

// ── Today (phase-aware home) ─────────────────────────────────────────────────────────────────────

export type DriverPhase = "collection" | "same_day_delivery" | "idle";

/**
 * A compact reference to the active/queued work item shown on the home.
 *
 * ⚠ `"hub_checkin"` ADDED BY 064, AND IT FIXES A LIVE DEFECT. A collection round's work did not end
 * at its last shop — the load still has to be checked in at the hub — but the hub had no
 * representation here, so `todayView`'s outstanding filter emptied the moment the final shop stop
 * went `done`. Both routes into the round (the hero card, drawn from `active`, and the "Whole run"
 * link, drawn only when `upNext` is non-empty) vanished at exactly that point. Found live on
 * 2026-09-21 with a driver holding thirteen packages and no way back into their own round.
 */
export interface TodayItemRef {
  kind: "collection_stop" | "delivery_drop" | "hub_checkin";
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
  /**
   * ⚠ ADDED BY 063, AND IT RETIRES A PLACEHOLDER. `collection/data/PlaceholderData.kt` declares
   * `stopAddress = operational("`shop.address`")` — an invented value a driver could act on, so the
   * app renders it as unavailable. 061 built `shop.address_*`; this carries it, and the unblocking
   * condition that placeholder names is now met.
   *
   * ⚠ AN ADDRESS, NEVER A POSITION (D20/D21). The app hands this to the device's own maps app
   * (D7 — per stop, not per route). No coordinate exists to send.
   *
   * Nullable because a shop whose address has not been recorded yet is an ordinary state the
   * back-office readiness view already reports (061 FR-029/030) — and a driver must be told the
   * address is missing rather than shown an empty line.
   */
  address: string | null;
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
  /** ⚠ See `CollectionStopSummary.address` — added by 063, retires the `stopAddress` placeholder. */
  address: string | null;
  packages: CollectionPackage[];
  status: CollectionStopStatus;
}

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect — collect this shop's packages. */
export interface CollectRequest {
  changeId: string;
  /**
   * ⚠ ADDED BY 063, OPTIONAL BY DESIGN. Absent means what it has always meant: every package at this
   * stop was collected. Present, it records each package's own outcome IN THE SAME REQUEST.
   *
   * That atomicity is the point (FR-026). With collect-all followed by a separate `/issue` call there
   * is a window in which the platform believes a package is in the van and it is not — and if the
   * second call never arrives (the driver walks out of signal, the app is killed), the window never
   * closes and nobody is told. One request cannot half-happen.
   *
   * ⚠ It is OPTIONAL rather than required so the existing client call remains valid and no Kotlin
   * call site changes. A required field here would have meant reworking the ViewModels behind
   * several of 060's screens to say something the old shape already said correctly.
   */
  packages?: Array<{
    packageId: string;
    outcome: "picked_up" | "not_available";
    note?: string | null;
  }>;
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
/**
 * ⚠ NARROWED BY 062 AND WIDENED BY 061, AND EVERY READER WAS AUDITED BEFORE EACH (T010, T015).
 *
 * 062 removed `no_zone` and added `no_capabilities`. ⚠ A NARROWING IS NOT THE MIRROR OF A WIDENING:
 * removing a member makes an exhaustive `Record<>` over it OVER-specified, which TypeScript reports
 * as an excess property — so the compiler helps here too. But stored rows and test fixtures carrying
 * the removed value do NOT announce themselves and had to be found by hand.
 *
 * ⚠ ORIGINAL 061 NOTE FOLLOWS. 053, 056 and 057 each shipped a
 * defect through an enum widening, and this one is unusually sharp: the console's `BLOCKED_LABEL` is
 * a `Record<DriverBlockedReason, string>`, so a missing key renders **nothing at all** — a blocked
 * driver with a blank reason reads as "not blocked". `model.test.ts` asserts the map is exhaustive so
 * the next widening fails the suite instead of rendering silence.
 *
 * Readers at the time of widening: `apis/edge-api/fleet/src/drivers/sql.ts` (the producer),
 * `apis/edge-api/fleet/src/readiness/`, `apps/back-office/src/features/drivers/model.ts`
 * (`BLOCKED_LABEL`) and its ReadinessPanel/list fixtures.
 *
 * ⚠ `no_zone` HAS NOW BEEN REMOVED by slice B, as that note predicted.
 */
export type DriverBlockedReason =
  | "suspended"
  | "offboarded"
  | "licence_expired"
  | "no_vehicle"
  | "vehicle_non_compliant"
  /** ⚠ 062 — replaces `no_zone`. A driver cleared for nothing cannot be given work, and the remedy
   *  is to grant them a clearance rather than to assign them a zone. */
  | "no_capabilities";

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
  /** ⚠ 062 — breadth of clearance replaces the old single zone. A SUMMARY, never the full set. */
  capabilitySummary: DriverCapabilitySummary;
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
  /** ⚠ Australian licence class (061, FR-021). Recorded so "may this driver legally drive this
   *  vehicle" is checkable rather than assumed — a WorkSafe Victoria OHS duty. */
  licenceClass: DriverLicenceClass | null;
}

/** ⚠ `vehicleRegistrationExpiresOn` LEFT THIS TYPE in 061. A registration expiry is a fact about a
 *  VEHICLE, not about a person, and it now lives on `public.vehicle` where a second driver holding
 *  the same van reads the same date. It was on the driver row only because vehicles had no table. */
export type DriverLicenceClass = "C" | "LR" | "MR" | "HR";

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
  // ⚠ `zoneId` / `zone` LEFT THIS TYPE IN 062. A driver's coverage is now a set of clearances
  // (`capabilities` below), because one zone could never express "same-day delivery here, standard
  // collection everywhere" — and because no assignment code ever read the old field.
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
  /** Everything this driver is cleared for (062, FR-007). */
  capabilities: DriverCapability[];
  accountState: DriverAccountState;
  /** The optimistic-concurrency token. A PATCH must echo the value it loaded (FR: edge case
   *  "two operators edit the same driver at once"); a stale one is refused with a named 409. */
  updatedAt: string;
}

export interface AdminDriverCreateRequest {
  name: string;
  workEmail: string;
  contactPhone?: string | null;
  // ⚠ `zoneId` LEFT THIS TYPE IN 062. A new driver starts cleared for nothing, and clearances are
  // granted deliberately afterwards — a create form that quietly assigns coverage is how somebody
  // ends up eligible for work nobody decided to give them.
  // ⚠ `vehicleType` / `vehiclePlate` / `vehicleRegistrationExpiresOn` LEFT THIS TYPE IN 061. A
  // vehicle is its own record; what a driver drives is decided by ISSUING them one, not by typing a
  // string here. A registration expiry is a fact about a vehicle, so two drivers holding the same
  // van now read the same date instead of two hand-maintained copies.
  licenceReference?: string | null;
  licenceExpiresOn?: string | null;
  licenceClass?: DriverLicenceClass | null;
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
  // ⚠ `zoneId` LEFT THIS TYPE IN 062 — clearances are granted and revoked through their own routes,
  // not edited as a field on the profile.
  // ⚠ `vehicleType` / `vehiclePlate` / `vehicleRegistrationExpiresOn` LEFT THIS TYPE IN 061. A
  // vehicle is its own record; what a driver drives is decided by ISSUING them one, not by typing a
  // string here. A registration expiry is a fact about a vehicle, so two drivers holding the same
  // van now read the same date instead of two hand-maintained copies.
  licenceReference?: string | null;
  licenceExpiresOn?: string | null;
  licenceClass?: DriverLicenceClass | null;
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
  // ⚠ `acknowledgeHeldWork` was here, and the dispatch slice will need it back. It gated FR-020's
  // itemised refusal when standing down a driver holding already-picked-up work; that work lived in
  // `collection_task` / `delivery_task`, so with nothing assigning anything no driver can hold any.
}

// ── Held / stranded work ─────────────────────────────────────────────────────────────────────────

// ── Stranded work and exceptions: RETIRED WITH THE WORK MODEL ───────────────────────────────────
//
// ⚠ `StrandedWork*` and `DriverException*` described rows in `collection_task`, `delivery_task`,
// `delivery_failure` and `collection_task_issue`, all dropped by
// db/migrations/20260920101500_remove_driver_work_model.sql. They are removed rather than kept as a
// dormant vocabulary, because 059 found a fourth reader of `device_token.platform` whose only sign of
// life was a comment saying web push was out of scope — exported, imported by nothing, quietly
// contradicting the live contract. A type nothing can populate is that shape waiting to happen.
//
// ⚠ THE CAPABILITY THEY SERVED IS NOT RESOLVED, ONLY UNBUILT. 056 existed because the driver app had
// been recording exceptions since 049 for a reader that did not exist — a driver marks a drop
// undeliverable and nobody at Effy is told. The dispatch slice inherits that requirement along with
// the work model it must redesign; ORDER-FLOW-GAPS.md is where it stays recorded until then.

// ── Duty ─────────────────────────────────────────────────────────────────────────────────────────

export interface OnDutyDriver {
  driverId: string;
  driverName: string;
  /** ⚠ 062 — derived from clearances, not a single assigned zone. Null when cleared for nothing. */
  zone: string | null;
  sessionId: string;
  onDutySince: string;
  /** ⚠ null = the driver did not say when they expect to finish. The console renders "unknown";
   *  it MUST NOT substitute a default shift length (061, FR-033). */
  expectedEndAt: string | null;
  /** True when an expected finish has already passed — visible, not alarming. */
  pastExpectedEnd: boolean;
  /** True when the session has been open longer than the configured threshold (FR-037). */
  overdue: boolean;
}

/**
 * Work that is ready and has no driver (FR-036).
 *
 * ⚠ THIS IS NOW A BACKLOG, NOT A SHORTFALL. It was computed with the assignment sweep's own candidate
 * predicate so the screen could not disagree with what the sweep saw; there is no sweep, nothing
 * claims work, and so every ready package counts. Until dispatch is rebuilt these figures only rise —
 * which is the one thing about the current state an operator needs to be able to see.
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

// ── Work history: RETIRED WITH THE WORK MODEL ───────────────────────────────────────────────────
//
// ⚠ `DriverRunSummary`, `DriverRunStop`, `DriverRunDetail`, `DriverPeriodSummary`,
// `DriverHistoryResponse` and `DriverProofResponse` all projected `driver_run`, `collection_task`,
// `delivery_task`, `driver_task_event` and `proof_of_delivery`. Gone with those tables.
//
// ⚠ `DriverAuditEntry` below is a DIFFERENT record and deliberately survives: it is the back-office
// change log in `admin.audit_log` — who edited a driver's profile, who stood them down and why. That
// is employment history, not work history, and nothing about it depended on the shape of a run.

// ── Clearances and coverage (062) ────────────────────────────────────────────────────────────────
//
// ⚠ BACK-OFFICE ONLY. None of these enter `driver-contract.ts`, so none reaches the generated Kotlin.
// A driver does not grant their own clearances; they see only the derived `DriverMeDTO.zone` line.

export type CapabilityFunction = "collection" | "delivery";
export type CapabilityMethod = "standard" | "same_day";

/**
 * One grant: this driver may do this kind of work in this place.
 *
 * ⚠ `zoneId: null` MEANS EVERY ZONE — including zones created afterwards. It is the single most
 * important fact in this feature, and the one whose absence would be invisible: an enumeration of
 * today's zones is correct when written and quietly wrong the first time a zone is added, with
 * nothing failing and nobody told.
 */
export interface DriverCapability {
  id: string;
  function: CapabilityFunction;
  method: CapabilityMethod;
  /** ⚠ null = every zone. */
  zoneId: string | null;
  /** ⚠ null for an every-zone grant — NEVER a server-supplied "All zones" string. The label is
   *  presentation, and a second place naming the concept is a second place it can drift. The console
   *  renders it from `zoneId === null`. */
  zoneName: string | null;
  grantedAt: string;
}

export interface DriverCapabilityListResponse {
  items: DriverCapability[];
}

/**
 * ⚠ `zoneId` is REQUIRED and may be explicitly `null`. A key absent and a key present-with-null must
 * not be conflated, or "everywhere" becomes indistinguishable from "the operator forgot to choose".
 */
export interface GrantCapabilityRequest {
  function: CapabilityFunction;
  method: CapabilityMethod;
  zoneId: string | null;
}

/** Breadth of clearance for the register (FR-014). ⚠ A SUMMARY, not the full set — shipping every
 *  grant would put an unbounded array on every row of a paged list. */
export interface DriverCapabilitySummary {
  total: WireInt;
  coversEveryZone: boolean;
  functions: CapabilityFunction[];
}

/** Why a zone cannot be served. ⚠ TWO REASONS, NOT ONE — an administrative gap and a rostering
 *  problem have different remedies, and collapsing them tells an operator nothing about what to do. */
export type CoverageGapReason = "no_driver_cleared" | "all_cleared_unavailable";

export interface CoverageGap {
  zoneId: string;
  zoneName: string;
  function: CapabilityFunction;
  method: CapabilityMethod;
  reason: CoverageGapReason;
  /** ⚠ What makes the two reasons ACTIONABLE: 0 means grant somebody a clearance; more than 0 means
   *  the people who have it cannot work today, and the fix is in the readiness view. */
  clearedDriverCount: WireInt;
}

/**
 * ⚠ A LIST OF PROBLEMS, NOT A MATRIX. A covered (zone, function, method) emits NO ROW at all
 * (FR-019) — a screen that lists everything and colours the bad ones is a screen an operator has to
 * scan.
 *
 * ⚠ Only the work a zone can actually RECEIVE is enumerated: same-day appears only for zones whose
 * `sameday_eligible` is true. Otherwise "nobody is cleared for same-day in Ballarat" would be a
 * permanent, unfixable row in the one view whose purpose is to be actionable.
 */
export interface CoverageResponse {
  gaps: CoverageGap[];
}

// ── Vehicles (061) ───────────────────────────────────────────────────────────────────────────────
//
// ⚠ BACK-OFFICE ONLY. None of these enter `driver-contract.ts`, so none reaches the generated Kotlin
// and the driver app is unaffected. A driver sees the vehicle they hold through `DriverVehicle`.
//
// ⚠ NO MONEY ANYWHERE. Not a purchase price, not a lease cost, not a fuel figure. The driver domain
// has never carried currency (049 FR-013) and 061 does not introduce it.
//
// ⚠ NO COORDINATES ANYWHERE. Nothing on this platform computes distance (D20).

export type VehicleBodyType = "van" | "ute" | "truck_light" | "car" | "motorcycle" | "bicycle";
export type VehicleFuelType = "petrol" | "diesel" | "hybrid" | "electric" | "none";
export type VehicleOwnership = "effy_owned" | "driver_owned";

/** ⚠ `off_road` is NOT `retired`. Off-road is temporary and the vehicle comes back; retired is
 *  terminal and the record survives for history. Collapsing them makes "where did the van go?"
 *  unanswerable. */
export type VehicleStatus = "active" | "off_road" | "retired";

/** Which compliance item has lapsed. ⚠ DERIVED ON READ from the three expiry dates, never stored —
 *  compliance is time-dependent and a stored flag goes stale silently at midnight (027's
 *  counted-not-stored rule, fourth application). */
export type VehicleComplianceIssue =
  | "registration_expired"
  | "insurance_expired"
  | "roadworthy_expired";

/** One row of the register (FR-001, FR-009). ⚠ Carries `complianceIssues` so an operator can answer
 *  "what is roadworthy" WITHOUT opening a record. */
export interface VehicleListItem {
  id: string;
  registrationPlate: string;
  make: string;
  model: string;
  bodyType: VehicleBodyType;
  ownership: VehicleOwnership;
  canCarryChilled: boolean;
  canCarryFrozen: boolean;
  status: VehicleStatus;
  currentHolderDriverId: string | null;
  currentHolderName: string | null;
  complianceIssues: VehicleComplianceIssue[];
}

export interface VehicleListResponse {
  items: VehicleListItem[];
  /** ⚠ Consumed by the UI, not merely returned. 053 shipped a console silently capped at 25 rows. */
  nextCursor: string | null;
}

/** One period a driver had a vehicle (FR-016). */
export interface VehicleHolding {
  id: string;
  driverId: string;
  driverName: string;
  startedAt: string;
  /** null = still held. */
  endedAt: string | null;
  odometerStartKm: WireInt | null;
  odometerEndKm: WireInt | null;
  note: string | null;
}

export interface VehicleDetail extends VehicleListItem {
  year: WireInt | null;
  fuelType: VehicleFuelType | null;
  payloadKg: WireInt | null;
  loadVolumeLitres: WireInt | null;
  crateCapacity: WireInt | null;
  registrationExpiresOn: string | null;
  insurancePolicyReference: string | null;
  insuranceExpiresOn: string | null;
  roadworthyExpiresOn: string | null;
  odometerKm: WireInt | null;
  statusReason: string | null;
  notes: string | null;
  createdAt: string;
  /** Optimistic-concurrency token; a PATCH echoes what it loaded. */
  updatedAt: string;
  /** Newest first (FR-016). */
  holdings: VehicleHolding[];
}

export interface VehicleCreateRequest {
  registrationPlate: string;
  make: string;
  model: string;
  bodyType: VehicleBodyType;
  ownership: VehicleOwnership;
  year?: WireInt | null;
  fuelType?: VehicleFuelType | null;
  payloadKg?: WireInt | null;
  loadVolumeLitres?: WireInt | null;
  crateCapacity?: WireInt | null;
  canCarryChilled?: boolean;
  canCarryFrozen?: boolean;
  registrationExpiresOn?: string | null;
  insurancePolicyReference?: string | null;
  insuranceExpiresOn?: string | null;
  roadworthyExpiresOn?: string | null;
  odometerKm?: WireInt | null;
  notes?: string | null;
}

/**
 * ⚠ PRESENCE, NOT VALUE — the same rule 056 established for drivers and fixed a real defect over.
 * A key present with `null` CLEARS the field; a key absent leaves it alone. `COALESCE($n, col)`
 * cannot tell those apart, which is how a zone once assigned became permanent. Do not "clean" this
 * object on the way out: dropping nulls silently restores that defect.
 */
export type VehicleUpdateRequest = Partial<VehicleCreateRequest> & { updatedAt: string };

export interface VehicleStatusRequest {
  status: VehicleStatus;
  reason: string;
}

export interface HoldingIssueRequest {
  driverId: string;
  odometerStartKm?: WireInt | null;
  note?: string | null;
}

export interface HoldingReturnRequest {
  odometerEndKm?: WireInt | null;
  note?: string | null;
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
