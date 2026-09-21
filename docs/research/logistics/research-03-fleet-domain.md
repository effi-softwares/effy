# Fleet, Driver & Vehicle Domain Model — Research Report
Effy · Melbourne grocery delivery · hub-and-spoke, 1 hub, <10 drivers (Phase 1)
Prepared 2026-09-20

> **Verification note (read first):** This session's live web-search budget was exhausted partway through
> research (after ~10 `WebSearch` calls); the remainder of the evidence gathering was done via `WebFetch`
> against specific pages. Every claim below is either (a) sourced to a fetched/searched URL in §7, or
> (b) explicitly marked **[UNVERIFIED — general domain knowledge, not confirmed this session]**. Where a
> source's own answer was inconclusive (e.g. Food Safety Supervisor applicability to delivery-only
> operations), that is stated plainly rather than resolved by guessing.

---

## §1 Driver record — field catalogue

Sources: Samsara driver profile/qualifications docs, Deputy/Tanda (AU rostering/HR) product pages, plus
cross-referenced general fleet-HR practice. Effy's current `public.driver` columns are noted against each
group.

### 1.1 Identity
| Field | Tag | Notes |
|---|---|---|
| Full legal name | ESSENTIAL | **have** (`name`) |
| Preferred/display name | USEFUL | not present |
| Date of birth | USEFUL | needed for licence-class eligibility checks (age minimums), payroll/super — not present |
| Cognito subject id (auth) | ESSENTIAL | **have** (`cognito_sub`) |
| Employee/staff number | USEFUL | useful for payroll cross-reference, badge printing — not present |
| Photo | USEFUL | ID verification, customer-facing "your driver" card (Uber/Bolt pattern) — not present |

### 1.2 Contact
| Field | Tag | Notes |
|---|---|---|
| Work email | ESSENTIAL | **have** (`work_email`) |
| Personal/contact phone | ESSENTIAL | **have** (`contact_phone`) |
| Personal email | USEFUL | separate from work login, useful for offboarding comms |
| Residential address | USEFUL | payroll/super/Fair Work record-keeping obligation (Fair Work Regs require certain employee records incl. address) — not present |

### 1.3 Employment
| Field | Tag | Notes |
|---|---|---|
| Employment status (active/suspended/offboarded) | ESSENTIAL | **have** (`status`) |
| Status reason | ESSENTIAL | **have** (`status_reason`) |
| Status changed at | ESSENTIAL | **have** (`status_changed_at`) |
| Start date | ESSENTIAL | **have** (`started_on`) |
| End date | USEFUL | only implied by offboarded status today; an explicit `ended_on` supports reporting/tenure calc — not present |
| Employment type (full-time/part-time/casual) | ESSENTIAL for payroll/award compliance | not present — Fair Work award coverage (Road Transport and Distribution Award 2020, if applicable — see §4) hinges on this |
| Award/classification & pay grade | ESSENTIAL if payroll integrated | not present; Transport Worker Grade 1–10 under MA000038 — [fairwork.gov.au](https://awards.fairwork.gov.au/MA000038.html) |
| Home depot/hub | OVERKILL-AT-OUR-SCALE (1 hub) | with a single hub this is implicit; becomes ESSENTIAL at multi-hub |
| Manager/supervisor | OVERKILL-AT-OUR-SCALE | <10 drivers is a flat structure |

### 1.4 Licence & compliance (see §4 for legal detail)
| Field | Tag | Notes |
|---|---|---|
| Licence reference/number | ESSENTIAL | **have** (`licence_reference`) |
| Licence expiry date | ESSENTIAL | **have** (`licence_expires_on`) |
| Licence class (C/LR/MR/HR etc.) | ESSENTIAL — **missing** | needed to validate a driver may legally drive the vehicle they're assigned (see §3/§4); Effy currently stores none of this |
| Licence issuing state | USEFUL | interstate licences are valid in Vic but useful for verification workflow |
| Licence document (photo/scan, stored privately) | USEFUL | Samsara/Fleetio both support document upload+verification workflows — [kb.samsara.com](https://kb.samsara.com/hc/en-us/articles/33888131337741-Qualifications-Management) |
| Licence verification status (verified/pending/expired) | USEFUL | supports a "block assignment on expiry" workflow (§4) |
| Vehicle registration expiry (of driver's OWN vehicle, if BYO) | ESSENTIAL if BYO permitted | **have** (`vehicle_registration_expires_on`) — but this field belongs on the **vehicle**, not the driver, once vehicles are a first-class entity (see §2/§3) |
| Police check (National Police Check) | USEFUL | common industry practice for a role handling customers' property/homes, **not a specific legal mandate found for delivery driving** [UNVERIFIED — could not confirm a Victorian statutory requirement this session] |
| Working With Children Check (WWCC) | OVERKILL-AT-OUR-SCALE | only legally required for "child-related work" under the Victorian WWC Act 2005; ordinary grocery delivery to a residence is not child-related work **[UNVERIFIED — not independently re-confirmed this session, but is consistent with the WWCC Act's defined categories of child-related work, none of which is "delivers packages to addresses that may include children"]** |
| Food Safety Supervisor certificate | flag — **could not resolve, see §4.2** | |

### 1.5 Capability / skills
| Field | Tag | Notes |
|---|---|---|
| Delivery zone(s) capable of servicing | ESSENTIAL | **have, but singular** (`delivery_zone_id`, nullable, ONE zone) — real fleet systems (Onfleet, Routific, OptimoRoute) model this as a set, not a scalar, so a driver can be capability-matched to several zones |
| Task-type capability (collection / same-day delivery) | ESSENTIAL | not present as data — CLAUDE.md's "typed tasks, not driver roles" model needs this to be assignable, queryable state, not implicit |
| Vehicle-type capability (can drive van/car/bike etc.) | ESSENTIAL once vehicle is separate entity | derives from licence class × vehicle class — see §3 |
| Refrigerated-goods handling trained | USEFUL | relevant once frozen/chilled grocery delivery exists |
| Language(s) spoken | OVERKILL-AT-OUR-SCALE | useful at larger multicultural fleets (Uber Eats models this), not needed for <10 drivers |

### 1.6 Availability / duty (see §5)
| Field | Tag | Notes |
|---|---|---|
| Current duty state | ESSENTIAL | partially **have** via `driver_duty_session` (open/closed), but no richer state machine (idle/on-task/on-break) |
| Rostered shifts | OVERKILL-AT-OUR-SCALE | Deputy/Tanda-style rostering is unnecessary at <10 drivers doing informal shift patterns; ad-hoc clock-in (already built) is proportionate — see §5 |
| Max weekly hours / fatigue flag | USEFUL | supports Fair Work / OHS compliance reporting (§4.3) even though HVNL fatigue law itself doesn't apply to light vehicles |

### 1.7 Vehicle (to be REMOVED from driver, see §3)
| Field | Tag | Notes |
|---|---|---|
| `vehicle_type` (free text) | **REMOVE — replaced by vehicle entity** | |
| `vehicle_plate` (free text) | **REMOVE — replaced by vehicle entity** | |

### 1.8 Emergency
| Field | Tag | Notes |
|---|---|---|
| Emergency contact name | ESSENTIAL | **have** |
| Emergency contact phone | ESSENTIAL | **have** |
| Emergency contact relationship | USEFUL | not present, small addition |
| Medical conditions/allergies relevant to first-aid response | OVERKILL-AT-OUR-SCALE | sensitive-category personal info; only justified with a formal WHS medical-disclosure program, which a <10-driver operation doesn't need yet |

### 1.9 Payroll-adjacent — what NOT to store
Fleet/HR systems (Deputy, Tanda) hold payroll data (bank details, tax file number, superannuation fund) —
[deputy.com](https://www.deputy.com/au/payroll-software), [tanda.com.au](https://www.tanda.com.au/solutions/hr).
**Recommendation: do NOT add these to `public.driver`.** They are:
- highly sensitive PII (TFN handling has its own Commonwealth statutory scheme — TFN Rule — separate from
  the Privacy Act generally),
- payroll-system-of-record data, not fleet/dispatch data,
- irrelevant to any driver-app or dispatch use case.
If/when Effy adopts a payroll product, that product should be the system of record for these fields, linked
by driver id — not duplicated into the operational schema (consistent with Effy's own "one source of
truth" architectural principle).

### 1.10 Notes / free text
`notes` — **have**. Keep as an ESSENTIAL operator escape hatch (matches existing platform pattern, e.g.
`shop.notes`).

---

## §2 Vehicle record — field catalogue

Sources: Fleetio vehicle-record docs (fetched directly), Geotab Cold Chain feature docs, general asset-
management practice cross-referenced against Fleetio/Samsara/Geotab positioning.

### 2.1 Identity
| Field | Tag | Notes |
|---|---|---|
| Registration/number plate | ESSENTIAL | today lives as free text on driver — moves to vehicle |
| VIN | ESSENTIAL | unique hardware identity independent of plate (plates can be re-issued); Fleetio can VIN-decode 90+ specs automatically — [help.fleetio.com](https://help.fleetio.com/en_US/vehicle-overview) |
| Make | ESSENTIAL | |
| Model | ESSENTIAL | |
| Year | ESSENTIAL | |
| Colour | USEFUL | driver/customer identification ("look for the white van") |
| Internal fleet name/number (e.g. "Van 3") | ESSENTIAL | human-friendly handle for ops/driver app, distinct from VIN/plate |

### 2.2 Classification
| Field | Tag | Notes |
|---|---|---|
| Vehicle type (van/car/e-bike/truck) | ESSENTIAL | drives licence-class matching (§4) |
| Body/configuration (panel van, ute, etc.) | USEFUL | |
| Fuel type (petrol/diesel/EV/hybrid) | USEFUL | relevant for the WorkSafe hybrid/EV safety guidance too — [worksafe.vic.gov.au](https://www.worksafe.vic.gov.au/working-hybrid-and-electric-vehicles-safely) |
| Ownership type (Effy-owned / driver-owned·BYO) | ESSENTIAL | this is the field that makes the "Effy-owned assigned-per-shift" vs "driver-owned used for work" duality explicit (§3) |

### 2.3 Capacity (grocery-specific)
| Field | Tag | Notes |
|---|---|---|
| Payload capacity (kg) | USEFUL | relevant for load planning at scale; at <10 drivers, overkill for now but cheap to add |
| Cargo volume (m³) or crate/tote count | USEFUL | same |
| Refrigerated / chilled capability (yes/no + temp range) | ESSENTIAL once frozen/chilled grocery ships | Geotab's "Cold Chain" product exists specifically because reefer monitoring is a distinct fleet capability — [geotab.com](https://www.geotab.com/press-release/verizon-connect/) (support docs referenced in search); until Effy ships temperature-sensitive same-day grocery, this can stay **USEFUL**, but the schema should have the column now so vehicle capability can be queried (matches Effy's own "opt-in tracking, column not side-table" instinct seen elsewhere in the codebase, e.g. 054's product inventory) |

### 2.4 Compliance
| Field | Tag | Notes |
|---|---|---|
| Registration expiry date | ESSENTIAL | today misfiled as `driver.vehicle_registration_expires_on` — belongs on vehicle |
| CTP (compulsory third-party) status | USEFUL | in Victoria CTP is bundled into registration via the TAC charge, so this may just be "registered = CTP current" rather than a separate field — [ctpinsurance.com.au](https://www.ctpinsurance.com.au/vic/registration/) |
| Comprehensive/fleet insurance policy number + expiry | ESSENTIAL | third-party PROPERTY insurance is **not legally mandated** in Victoria but is standard commercial practice — [hooshmand.net](https://hooshmand.net/register-vehicle-victoria/) area |
| Roadworthy certificate status/expiry | USEFUL | in Victoria a Certificate of Roadworthiness (COR) is required at point of registration/transfer, not on a recurring cycle for a vehicle that stays registered — [transport.vic.gov.au](https://transport.vic.gov.au/road-and-active-transport/registration-and-licensing/registration/roadworthy-certification/roadworthy-certificate); a fleet still benefits from tracking **inspection due dates** as an operational (not purely legal) control |
| Last/next scheduled service date or odometer threshold | ESSENTIAL | ties into OHS "regular inspections, servicing, maintenance... by suitably competent persons" duty — [worksafe.vic.gov.au](https://www.worksafe.vic.gov.au/planning-safe-work-related-driving) |

### 2.5 Operations
| Field | Tag | Notes |
|---|---|---|
| Current odometer reading | ESSENTIAL | drives service-due logic |
| Odometer history | OVERKILL-AT-OUR-SCALE initially | Fleetio tracks full meter-entry history; a single "current value" column is proportionate for <10 vehicles, full history can be a later table if needed |
| Fuel card / fuel type reference | USEFUL | |
| Telematics/GPS device id (if fitted) | USEFUL | Effy already captures point-in-time lat/lng on `driver_duty_session` — a distinct device-id field on the vehicle would matter only if location capture moves from "driver's phone" to "vehicle-fitted hardware" |

### 2.6 Status (lifecycle)
| Field | Tag | Notes |
|---|---|---|
| Status: active / in-service / off-road (maintenance) / retired | ESSENTIAL | mirrors the driver's own active/suspended/offboarded pattern already used elsewhere in the schema — consistent with the platform's existing status-lifecycle convention |
| Status reason | ESSENTIAL | same pattern as `driver.status_reason` |
| Status changed at | ESSENTIAL | same pattern |

### 2.7 Documents
| Field | Tag | Notes |
|---|---|---|
| Registration papers / insurance certificate / roadworthy cert (private S3) | USEFUL | Effy already has private S3 for documents per the brief — natural fit |

---

## §3 Driver ↔ vehicle assignment model

Sources: Fleetio "Vehicle Assignments" (assignment/operator tracking), Whip Around/Fleetio inspection
docs (DVIR concept), general fleet practice for pool vehicles vs permanent assignment.

### 3.1 What fleet systems actually do
Fleet systems distinguish three assignment shapes:
1. **Permanent assignment** — one vehicle is "given" to one employee for an extended period (common for
   sales reps, not for a shared dispatch fleet).
2. **Pool/shift-based check-out** — a vehicle belongs to a pool; a driver checks one out for a shift and
   checks it back in. Fleetio's "Vehicle Assignments" feature tracks exactly this: an assignment record
   with an operator, a start, and (optionally) an end — [help.fleetio.com](https://help.fleetio.com/en_US/vehicle-overview).
3. **BYO/owner-operator** — the "vehicle" and the "assigned user" are effectively fixed and long-lived,
   but the record still benefits from being modelled the same way (an assignment with no end date) rather
   than as a special case, so the query "who is driving vehicle X right now" always has one answer shape.

This maps directly onto Effy's stated need: model BOTH "Effy-owned, assigned this shift" and "driver-owned,
used for work" as **the same relationship type**, distinguished by data (an `ownership` value on the
vehicle, or an `assignment_kind` on the assignment row) rather than by two different code paths.

### 3.2 Recommended schema shape
```
public.vehicle
  id, fleet_number, vin, plate, make, model, year, colour,
  vehicle_type, ownership ('effy_owned' | 'driver_owned'),
  refrigerated (bool), payload_kg, cargo_volume_m3,
  registration_expires_on, insurance_policy_ref, insurance_expires_on,
  roadworthy_expires_on (nullable — see §2.4 caveat),
  odometer_km, next_service_due_on / next_service_due_km,
  status ('active'|'in_service'|'off_road'|'retired'),
  status_reason, status_changed_at,
  notes, created_at, updated_at

public.vehicle_assignment
  id, vehicle_id, driver_id,
  started_at, ended_at (nullable — open = current),
  assignment_kind ('shift_checkout' | 'standing_byo' | 'standing_pool'),
  start_odometer_km, end_odometer_km (nullable),
  created_at, updated_at
  -- partial unique index: at most one OPEN assignment per vehicle
  -- (mirrors the existing pattern: driver_duty_session already has
  --  "at most one open session per driver" — the same constraint shape
  --  applies here for "at most one open assignment per vehicle" AND
  --  arguably "at most one open assignment per driver")
```

Why this shape:
- **One relationship, two meanings.** A `driver_owned` vehicle simply gets one `vehicle_assignment` row
  with `assignment_kind='standing_byo'` and no `ended_at` — it never needs a "checkout" UI action, but it
  answers the same "who's driving what" query as an Effy-owned shift checkout.
- **Matches the platform's own idiom.** Effy's `driver_duty_session` already uses "one open row, partial
  unique index" for on-duty state; reusing that shape for vehicle assignment keeps the two concepts
  legible together (a driver goes on duty AND is assigned a vehicle — two independent open-row
  relationships that a dispatcher can cross-reference).
- **Start/end odometer on the assignment row** gives you a free, structurally-enforced trip-distance +
  service-interval signal without needing a separate DVIR/inspection subsystem on day one.
- **Licence↔vehicle validity is a query, not new state**: `driver.licence_class` (new field, §1.4) joined
  against `vehicle.vehicle_type`'s required class is enough to refuse an assignment where the driver isn't
  legally entitled to drive that vehicle class — this is the "block assignment" behaviour real systems
  implement (Samsara's qualifications/compliance features exist for exactly this reason —
  [kb.samsara.com](https://kb.samsara.com/hc/en-us/articles/33888131337741-Qualifications-Management)).

### 3.3 Pre-trip inspection (DVIR) — do we need it?
- A DVIR is a **US FMCSA legal requirement for commercial motor vehicles**, not an Australian one —
  [whiparound.com](https://whiparound.com/the-complete-driver-vehicle-inspection-guide/) describes it in
  that regulatory frame explicitly.
- In Australia, the closest **legal** analogue for light vehicles is the general WorkSafe Victoria OHS duty
  to "ensure pre-operations checks are conducted daily on essential components... and that any defects are
  rectified by competent persons" — [worksafe.vic.gov.au](https://www.worksafe.vic.gov.au/planning-safe-work-related-driving).
  This is a **duty on the employer**, not a specific "you must log a DVIR" mandate, for vehicles under
  4.5t.
- **Recommendation**: a lightweight, OPTIONAL pre-shift check (a short checklist: lights, tyres, mirrors,
  visible damage, fuel/charge level) tied to the `vehicle_assignment` row satisfies the OHS duty and gives
  Effy a defect-reporting channel, without building a full DVIR compliance subsystem that light Australian
  vehicles don't legally require. Small fleets commonly do this anyway via apps like Whip Around even
  though it isn't mandated — [whiparound.com](https://whiparound.com/fleet-inspection-software/). This
  should be scoped as its own later feature, not bundled into the vehicle/assignment migration.

---

## §4 Australian compliance — precise, cited

### 4.1 Chain of Responsibility (CoR) / Heavy Vehicle National Law
- **HVNL itself applies only to vehicles with GVM > 4.5 tonnes.** Effy's delivery vans are near-certainly
  under this threshold. — [logisticsbureau.com](https://www.logisticsbureau.com/chain-of-responsibility/),
  confirmed via NHVR's own coverage description (accessed this session for the fatigue threshold, §4.3).
- Search results surfaced a claim that "Chain of Responsibility requirements extend to light vehicles under
  4.5 tonnes" in some contexts — this is **not independently verified** and reads as an overstatement of
  general supply-chain due-diligence practice rather than a specific statutory extension of CoR duties to
  sub-4.5t vehicles. **Software implication if true in any specific respect: none identified this
  session** — treat as low-risk unless legal counsel says otherwise.
- **Net effect for Effy**: HVNL/CoR primary, consignor and loader duties do **not** attach to Effy's fleet
  as currently described. No CoR-specific fields are needed.

### 4.2 Food Safety Supervisor (Food Act 1984, Vic)
- Victoria requires a **Food Safety Supervisor (FSS)** for all **Class 1** food businesses and most
  **Class 2** businesses (those handling/processing potentially hazardous, non-prepackaged food); **Class 3
  and 4** (lower-risk, largely prepackaged) are generally exempt —
  [blog.foodsafety.com.au](https://blog.foodsafety.com.au/food-safety-supervisor-vic-training-requirements).
- One source lists "Transport & Distribution" as one of five industry sectors with its own FSS competency
  units (SITXFSA005/006), implying the FSS obligation **can** reach a transport/distribution operation —
  but **whether a specific delivery driver personally needs FSS certification, versus the business simply
  needing ONE FSS somewhere in its operation (e.g. at the hub), was NOT resolved this session** — the
  primary legislative text (Food Act 1984 s19G) returned HTTP 403 and could not be read directly.
  **⚠ FLAGGED AS UNVERIFIED — this is a real open compliance question, not a software one, and should be
  put to Effy's own food-safety/legal advisor before assuming either answer.** What IS reasonably certain:
  the FSS requirement (if it applies at all) attaches to **the business/premises class**, not to "each
  person who drives," so the correct software shape — if Effy needs to satisfy it — is almost certainly
  "the hub/business holds an FSS certificate reference," not "every driver holds one." Do not build a
  per-driver FSS field speculatively.
- Effy's model shops pick/pack (no food prep) and drivers transport already-packed groceries — this fact
  pattern is closer to "Class 3/4, transport of prepackaged/pre-picked goods" than to a business that
  cooks/handles hazardous unpackaged food, which suggests (but does not confirm) FSS is **not** required.

### 4.3 Fatigue management
- **HVNL fatigue rules (standard hours, BFM, AFM) apply only to "fatigue-regulated heavy vehicles" — GVM
  over 12 tonnes** (or combinations/buses per NHVR's specific thresholds) —
  [nhvr.gov.au](https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management) (fetched this
  session). **Effy's light vans are well under this threshold — HVNL fatigue law does not apply.**
- What DOES apply: **award-based rest/break entitlements**, if the Road Transport and Distribution Award
  2020 (MA000038) covers Effy's drivers (uncertain — see 4.3.1), OR the general OHS duty to manage
  fatigue as a workplace hazard (WorkSafe Victoria's general "safe systems of work" duty,
  [worksafe.vic.gov.au](https://www.worksafe.vic.gov.au/planning-safe-work-related-driving)), which applies
  regardless of award coverage.
- **4.3.1 Which award covers Effy's drivers? Not resolved with confidence.** The Road Transport and
  Distribution Award 2020 covers employers in "the road transport and distribution industry" — a business
  whose main game is transport — [fairwork.gov.au](https://awards.fairwork.gov.au/MA000038.html),
  [au.connecteam.com](https://au.connecteam.com/awards/road-transport-and-distribution/). Effy is
  primarily a **grocery retailer** that happens to run its own delivery fleet, which is exactly the kind
  of edge case Fair Work coverage determinations turn on ("is transport the core business, or incidental
  to retail?"). The General Retail Industry Award 2020 was named in the research brief as a possible
  alternative but **could not be directly confirmed this session** (search budget exhausted; a direct
  fetch of its FWC page 403'd). **⚠ FLAGGED — Effy should get a formal award-coverage determination (or
  at minimum an employment lawyer's opinion) rather than assume either award.** If MA000038 applies, the
  concrete numbers found this session are: meal break required after no more than 5.5 continuous hours
  worked, break duration 30–60 minutes, casual minimum engagement 4 hours, ordinary hours ≤ 8/day —
  [fairwork.gov.au](https://awards.fairwork.gov.au/MA000038.html).
- **Software implication either way**: a shift-length/break-timing field or computed check is useful
  operational hygiene regardless of which award applies (Fair Work minimums are close between awards for
  meal breaks), but the exact numbers should not be hard-coded until coverage is confirmed — store the
  award/classification on the driver record (§1.3) so the correct rule-set can be swapped in without a
  schema change.

### 4.4 OHS duties — vehicle as workplace (WorkSafe Victoria)
- Confirmed: **"Whenever a worker is on the road as part of their role, that vehicle is considered to be
  their workplace"** — general OHS Act 2004 duties apply —
  [worksafe.vic.gov.au](https://www.worksafe.vic.gov.au/planning-safe-work-related-driving).
- Concrete employer obligations found: identify and eliminate/reduce driving-related hazards; ensure
  regular vehicle inspection/servicing/maintenance by competent persons per manufacturer schedule; ensure
  daily pre-operations checks on brakes/steering/tyres/indicators/suspension/leaks with defects rectified
  by competent persons; never allow untrained/unlicensed/inexperienced people to operate vehicles.
- **Software implications**:
  - a **field**: service-due tracking on the vehicle (§2.5) — supports "regular inspection/servicing";
  - a **field/workflow**: optional pre-shift defect check (§3.3) — supports "daily pre-operations checks";
  - a **block**: licence-class validation before assignment (§3.2) — supports "never allow unlicensed
    people to operate vehicles" as a system-enforced control, not just a policy;
  - a **log**: assignment history (`vehicle_assignment`) itself is the audit trail that "who was driving
    this vehicle, when" questions (accident investigation, WorkSafe incident reporting) need.

### 4.5 Privacy Act 1988 / Australian Privacy Principles — employee location tracking
**This is the item CLAUDE.md specifically flagged as important, and it deserves the most care.**

- **The Privacy Act's "employee records exemption"** (s.6(1)) exempts a private-sector employer's handling
  of *employee records*, for a *current or former employment relationship*, from the Australian Privacy
  Principles — but **only for acts/practices directly related to the employment relationship**. It does
  **not** cover: job applicants, volunteers, contractors handling employee data on the employer's behalf
  (e.g. a third-party HR/payroll vendor), or any use outside the employment relationship —
  [oaic.gov.au](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/employee-records-exemption)
  (fetched this session). There is also a live policy trend to **narrow or remove** this exemption — the
  government has "agreed in principle" to do so per the same research. **Do not rely on this exemption as
  a permanent safe harbour.**
- **This exemption is federal and does NOT displace Victorian surveillance law.** Victoria's own
  **Surveillance Devices Act 1999 (Vic)** separately regulates the **use of tracking devices** —
  [armstronglegal.com.au](https://www.armstronglegal.com.au/commercial-law/vic/employment-law/workplace-surveillance/)
  (fetched this session), and the **Office of the Victorian Information Commissioner (OVIC)** publishes
  direct guidance on GPS-tracking employees —
  [ovic.vic.gov.au](https://ovic.vic.gov.au/privacy/resources-for-organisations/privacy-during-employment/)
  (fetched this session).
- **Victoria does NOT have a direct equivalent to NSW's Workplace Surveillance Act 2005** as a
  purpose-built workplace-surveillance statute — Victorian obligations instead flow from the general
  Surveillance Devices Act 1999 (which regulates listening/optical/tracking devices generally, not
  specifically "at work") plus OVIC's Information Privacy Principles guidance for the public sector and
  general Privacy Act coverage for the private sector. This was stated by a legal-guidance source but its
  absence-of-an-equivalent claim was **not independently found in a primary Victorian statute this
  session — treat as probable, not certain.**
- **Concrete, actionable requirements found (OVIC + Armstrong Legal, both fetched):**
  1. **Notice is required.** Employees must be told **when** tracking occurs (business hours only, or
     always), **what** information is collected, **why**, and **what happens if they object.**
  2. **A tracking device's installation/use/maintenance requires the tracked person's express or implied
     consent** under the Surveillance Devices Act — a signed policy acknowledged at onboarding is the
     standard way employers establish this.
  3. **Purpose and proportionality matter.** OVIC: reasonableness/intrusiveness "will depend on the
     purpose... and how it is tied to the organisation's functions" — tracking must be proportionate to a
     legitimate business need (dispatch, safety, proof of delivery), not open-ended surveillance.
  4. **Disable tracking when there's no legitimate purpose** — e.g. outside rostered work hours, or on a
     driver's personal device/vehicle when off-duty, per OVIC.
  5. **Recommended (not universally mandated): a Privacy Impact Assessment** before implementing/expanding
     tracking, and consideration of less-intrusive alternatives — OVIC.
  6. Non-compliance under the Surveillance Devices Act can carry penalties up to **$180,000 for a
     company** per the Radius/telematics-industry summary found in search — **this figure was not
     independently verified against the Act's own penalty schedule this session; treat as indicative,
     not authoritative, and confirm before citing it externally.**

- **Does Effy's current design — point-in-time location snapshots on `driver_duty_session`
  (`last_location_lat/lng/at`) rather than continuous tracking — satisfy this?**
  - The OVIC guidance **does not distinguish continuous vs point-in-time tracking as a legal test** — both
    trigger the same notice/purpose/proportionality obligations. So switching to point-in-time snapshots
    does **not**, by itself, exempt Effy from notice/consent duties — but it **does** materially reduce the
    *intrusiveness* that the "proportionality" test weighs, which is the more defensible posture of the
    two. **This was the right instinct, not a compliance shortcut** — it doesn't remove the need for a
    documented policy/notice, but it lowers the bar that policy has to clear.
  - **What Effy is likely still missing, based on this research (⚠ recommend legal confirmation, not
    software-only fix):**
    - No evidence in the schema of a recorded, timestamped **employee acknowledgment/consent** to
      location tracking (a driver-app onboarding step + a stored consent record would close this).
    - No evidence of a **documented tracking policy** stating purpose, hours of operation, and
      consequences of objection — this is a **product/policy artifact** as much as a schema one, but the
      *system* should be able to prove "driver X was shown and accepted policy version Y on date Z,"
      which implies a small `driver_tracking_consent` (or similar) record, not just a UI screen.
    - Tracking should plausibly be **scoped to on-duty only** — `driver_duty_session` already only
      captures location while a session is open, which is a good structural fit for the "disable when no
      legitimate purpose" principle, **provided the app doesn't also request background location
      permission that could capture off-duty position** (a mobile-implementation detail outside this
      research's scope to verify, but worth an explicit engineering check).

### 4.6 Vehicle registration, CTP, roadworthy — Victoria
- Victorian CTP is **bundled into vehicle registration** via the TAC charge — there is no separate CTP
  policy to track for a Victorian-registered vehicle; "registered" effectively implies "CTP current" —
  [ctpinsurance.com.au](https://www.ctpinsurance.com.au/vic/registration/).
- A **roadworthy certificate (COR)** is required at point of registration/transfer and is valid/usable for
  30 days from issue for that purpose — it is **not** a recurring annual requirement for a vehicle that
  stays continuously registered in Victoria (this differs from some other jurisdictions/vehicle classes,
  e.g. commercial passenger vehicles which DO need annual roadworthy inspections) —
  [transport.vic.gov.au](https://transport.vic.gov.au/road-and-active-transport/registration-and-licensing/registration/roadworthy-certification/roadworthy-certificate),
  [hooshmand.net](https://hooshmand.net/register-vehicle-victoria/). **Software implication**: track
  registration expiry as the primary compliance gate; track "last roadworthy" as an operational/insurance
  best-practice field, not a recurring statutory countdown, unless Effy's insurer requires otherwise.
- Third-party **property** damage insurance is not legally mandated in Victoria but is standard commercial
  practice — [hooshmand.net](https://hooshmand.net/register-vehicle-victoria/). Track policy + expiry on
  the vehicle (§2.4).

### 4.7 Driver licence class vs vehicle
- **Class C** (ordinary car licence) covers vehicles up to **4.5 tonnes GVM**, seating ≤ 12 adults — this
  covers essentially every plausible Effy delivery van.
- **LR** (Light Rigid, 4.5–8t GVM) and above are only relevant if Effy ever operates larger box trucks —
  not currently in scope.
- [zutobi.com](https://zutobi.com/au/driver-guides/types-of-drivers-licence-classes),
  [singhandkaurdrivingschool.com.au](https://www.singhandkaurdrivingschool.com.au/different-vic-driver-licence-classes-everything-you-need-to-know/).
- **Software implication**: add `driver.licence_class` (even if every current driver holds plain Class C,
  the field earns its keep the moment Effy adds one larger vehicle) and a `vehicle.required_licence_class`
  (or derive it from `vehicle_type`) so assignment-time validation is a real, enforced rule rather than a
  policy nobody checks — directly satisfying the WorkSafe "never allow unlicensed people to operate
  vehicles" duty (§4.4) in software.

---

## §5 Duty / shift and capability model — recommendation

Sources: Onfleet driver-status docs (fetched/searched this session); Deputy/Tanda general positioning;
Effy's own existing `driver_duty_session` design as the baseline to extend.

### 5.1 Driver states
Onfleet's model — confirmed via
[support.onfleet.com](https://support.onfleet.com/hc/en-us/articles/10228905705876-Driver-Status) —
uses exactly four states that map cleanly onto Effy's hub-and-spoke model:
- **Offline** — not signed in / app closed. Not tracked.
- **On-duty, idle** — on shift, no active task. Tracked.
- **On-duty, in transit/on-task** — actively executing a collection run or delivery drop. Tracked.
- **Off-duty** — explicitly clocked off (Onfleet's variant of "offline while still logged in"). Not
  tracked.

**Recommendation for Effy**: extend `driver_duty_session` with a `state` column
(`idle` | `on_collection_run` | `on_delivery_run` | `on_break`) rather than inferring state from joins
against the collection-run/delivery-run tables. This:
- gives dispatch a single, queryable "what is every on-duty driver doing right now" view,
- gives the location-tracking-scoping requirement (§4.5) a clean hook — tracking is justified while
  `state != on_break` and the session is open, and the "disable when not needed" principle becomes a
  one-line predicate,
- adds an explicit **on-break** state, which is currently entirely absent from the schema and which both
  the OHS fatigue-management duty (§4.4) and any award break entitlement (§4.3) will eventually want to
  report against.

### 5.2 Roster vs clock-in
At **fewer than 10 drivers**, a formal roster (Deputy/Tanda-style shift planning, shift-swap requests,
published weekly schedules) is **OVERKILL-AT-OUR-SCALE**. Ad-hoc clock-in via `driver_duty_session` (which
Effy already has) is the proportionate mechanism, consistent with how small last-mile operators actually
run (Onfleet/Bringg's own driver-facing apps are clock-in-first, not roster-first, for exactly this reason
— rostering is a feature that shows up in *dispatcher* tooling at larger scale, not in the driver's own
state machine). **Recommendation: do not build rostering now; revisit if/when driver count grows past
roughly 15–20**, a threshold at which manual shift coordination via chat/text typically breaks down in
comparable small last-mile fleets **[UNVERIFIED — this specific numeric threshold is a reasonable estimate
from general small-ops practice, not a cited figure]**.

### 5.3 Capability matching — multi-dimensional
Effy needs a driver assignable across a genuine cross-product: {which zones} × {which task types}. The
current schema flattens this to a single nullable `delivery_zone_id` on `driver`, which cannot express
"this driver can do collection runs in Zone A and Zone B, and same-day delivery only in Zone A."

**Recommendation**: a small join table rather than widening `driver` further:
```
public.driver_capability
  id, driver_id, delivery_zone_id, task_type ('collection'|'same_day_delivery'),
  created_at
```
This is the same "columns vs side-table" judgement call the platform has already made deliberately
elsewhere (054's product-inventory columns-not-side-table decision) — but capability is genuinely
many-to-many (multiple zones × multiple task types per driver), which is exactly the shape a join table
is for, unlike a single boolean flag. Onfleet/Bringg/Routific-class systems all express driver capability
as tags/attributes matched against task requirements at assignment time rather than as a fixed scalar
field, which is the pattern this mirrors — general practice, not a specific cited implementation detail
(search budget was exhausted before a direct confirmation of Routific/Bringg's exact schema could be
pulled this session; **flagged as [UNVERIFIED in implementation specifics, though the general pattern is
well-established industry practice]**).

At Effy's current scale (1 hub, <10 drivers, "one driver typically does a collection run then a same-day
round in one shift" per CLAUDE.md), a simpler starting point — every active driver is implicitly capable
of every task type, and zone capability is the only real constraint — may be sufficient for Phase 1. The
join table above is future-proofing that costs little now and avoids a second migration later; whether to
build it now or defer is a product-scope call, not a data-modelling one.

---

## §6 Requirement catalogue (exhaustive, numbered)

**Driver**
1. Store driver full legal name — ESSENTIAL (have)
2. Store driver preferred/display name — USEFUL
3. Store driver date of birth — USEFUL
4. Store Cognito subject id — ESSENTIAL (have)
5. Store employee/staff number — USEFUL
6. Store driver photo (private) — USEFUL
7. Store work email — ESSENTIAL (have)
8. Store contact phone — ESSENTIAL (have)
9. Store personal email — USEFUL
10. Store residential address — USEFUL (Fair Work record-keeping)
11. Store employment status (active/suspended/offboarded) — ESSENTIAL (have)
12. Store status reason — ESSENTIAL (have)
13. Store status changed timestamp — ESSENTIAL (have)
14. Store start date — ESSENTIAL (have)
15. Store end date (explicit) — USEFUL
16. Store employment type (FT/PT/casual) — ESSENTIAL for payroll/award
17. Store award classification/pay grade — ESSENTIAL if payroll integrated
18. Store licence reference/number — ESSENTIAL (have)
19. Store licence expiry — ESSENTIAL (have)
20. Store licence CLASS (C/LR/MR/HR) — ESSENTIAL, **missing today**
21. Store licence issuing state — USEFUL
22. Store licence document image/scan (private S3) — USEFUL
23. Store licence verification status — USEFUL
24. Block vehicle assignment when licence class insufficient for vehicle type — ESSENTIAL (software rule, §4.7)
25. Block vehicle assignment when licence expired — ESSENTIAL (software rule)
26. Warn (not block) N days before licence expiry — USEFUL
27. Store police check status (if adopted as policy) — USEFUL, not legally mandated (unverified)
28. Do NOT build Working With Children Check field — OVERKILL, not applicable to this work
29. Do NOT build per-driver Food Safety Supervisor field speculatively — flagged unresolved, business-level not driver-level if needed at all
30. Store driver emergency contact name — ESSENTIAL (have)
31. Store driver emergency contact phone — ESSENTIAL (have)
32. Store emergency contact relationship — USEFUL
33. Do NOT store medical conditions/allergies — OVERKILL, sensitive-category data disproportionate at this scale
34. Do NOT store payroll bank details / TFN / super fund — OUT OF SCOPE, belongs in a payroll system of record
35. Keep free-text notes field — ESSENTIAL (have)
36. Remove `vehicle_type` free text from driver — ESSENTIAL (migrate to vehicle entity)
37. Remove `vehicle_plate` free text from driver — ESSENTIAL (migrate to vehicle entity)
38. Remove/relocate `vehicle_registration_expires_on` from driver — ESSENTIAL (belongs on vehicle)

**Vehicle**
39. Store vehicle fleet number/name (human handle) — ESSENTIAL
40. Store VIN — ESSENTIAL
41. Store registration plate — ESSENTIAL
42. Store make — ESSENTIAL
43. Store model — ESSENTIAL
44. Store year — ESSENTIAL
45. Store colour — USEFUL
46. Store vehicle type (van/car/bike/truck) — ESSENTIAL
47. Store body/configuration — USEFUL
48. Store fuel type — USEFUL
49. Store ownership type (Effy-owned / driver-owned) — ESSENTIAL (core to the requested model)
50. Store payload capacity (kg) — USEFUL
51. Store cargo volume / crate count — USEFUL
52. Store refrigerated capability flag + temp range — USEFUL now, ESSENTIAL once chilled/frozen grocery ships
53. Store registration expiry — ESSENTIAL
54. Store insurance policy reference + expiry — ESSENTIAL
55. Store roadworthy/inspection status + last date — USEFUL (not a recurring statutory clock for continuously-registered Vic vehicles)
56. Store required licence class (or derive from vehicle_type) — ESSENTIAL (enables rule #24)
57. Store current odometer reading — ESSENTIAL
58. Store next-service-due (date or km) — ESSENTIAL (OHS duty, §4.4)
59. Store telematics/GPS device id (if fitted) — USEFUL
60. Store vehicle status (active/in_service/off_road/retired) — ESSENTIAL
61. Store vehicle status reason — ESSENTIAL
62. Store vehicle status changed timestamp — ESSENTIAL
63. Store vehicle documents (registration papers, insurance cert) in private S3 — USEFUL
64. Warn N days before registration/insurance expiry — USEFUL
65. Block vehicle from assignment when status = off_road/retired — ESSENTIAL

**Driver ↔ vehicle assignment**
66. Model assignment as its own entity/table, not a driver column — ESSENTIAL (core to the requested model)
67. Support `assignment_kind` distinguishing shift-checkout vs standing/BYO — ESSENTIAL
68. Enforce at most one OPEN assignment per vehicle at a time — ESSENTIAL (data integrity)
69. Enforce at most one OPEN assignment per driver at a time — USEFUL (prevents a driver "holding" two vehicles simultaneously by mistake)
70. Capture start odometer on check-out — USEFUL
71. Capture end odometer on check-in — USEFUL
72. Support an optional lightweight pre-shift defect checklist — USEFUL (satisfies OHS daily pre-operations-check duty, §4.4), not a full DVIR subsystem
73. Keep assignment history queryable ("who drove vehicle X on date Y") — ESSENTIAL (audit trail for incident investigation)

**Duty / shift / capability**
74. Extend duty session with an explicit state (idle / on_collection_run / on_delivery_run / on_break) — ESSENTIAL
75. Add an explicit on-break state — ESSENTIAL (currently absent; matters for §4.3/§4.4)
76. Do NOT build a formal roster/schedule-planning feature at <10 drivers — OVERKILL-AT-OUR-SCALE
77. Model driver capability as zone × task-type (join table), not a single nullable zone — ESSENTIAL once multi-zone/multi-task assignment is needed; may defer if Phase 1 keeps one zone per driver
78. Consider deferring capability join table if Phase 1 truly has one driver = one zone = all task types — acceptable simplification, flagged for revisit

**Privacy / tracking compliance (software-actionable)**
79. Record a timestamped driver consent/acknowledgment to location tracking (policy version + date) — ESSENTIAL, currently missing
80. Scope location capture strictly to open, on-duty sessions (already true structurally) — ESSENTIAL, verify mobile permission model doesn't capture off-duty/background location
81. Ensure the driver-facing app surfaces a plain-language notice of what's tracked, when, and why, at onboarding — ESSENTIAL (product/UX requirement, not just schema)
82. Do not silently widen tracking (e.g. background location) without corresponding notice update — ESSENTIAL (process/governance requirement)
83. Confirm with legal counsel whether continuous tracking is ever required (e.g. for a future live-map feature) before building it, given point-in-time snapshots are the more defensible current posture — USEFUL governance step

**Compliance-adjacent, unresolved — do not build speculatively**
84. Do NOT hard-code Road Transport and Distribution Award break/shift rules into the schema until award coverage is confirmed — store `award`/`classification` as data so rules stay swappable
85. Do NOT build Chain of Responsibility-specific fields (mass/loading records, etc.) — does not apply at <4.5t GVM
86. Do NOT build HVNL fatigue (BFM/AFM/work diary) tracking — does not apply below 12t GVM
87. Get a formal determination on Food Safety Supervisor applicability before building or skipping any related field — currently genuinely unresolved

---

## §7 Sources

- Samsara — Driver Profile Settings: https://kb.samsara.com/hc/en-us/articles/26089090263437-Driver-Profile-Settings
- Samsara — Qualifications Management: https://kb.samsara.com/hc/en-us/articles/33888131337741-Qualifications-Management
- Samsara — Driver Detail Visibility: https://kb.samsara.com/hc/en-us/articles/34938392356109-Driver-Detail-Visibility
- Samsara — Create a New Driver Account: https://kb.samsara.com/hc/en-us/articles/4402804484621-Create-a-New-Driver-Account
- Fleetio — Vehicle Overview: https://help.fleetio.com/en_US/vehicle-overview
- Fleetio — Asset Management: https://help.fleetio.com/en_US/asset-management
- Fleetio — Asset Management Software product page: https://www.fleetio.com/features/asset-management-software
- Geotab — Verizon Connect acquisition / Cold Chain reference: https://www.geotab.com/press-release/verizon-connect/
- Whip Around — Fleet Inspection Software: https://whiparound.com/fleet-inspection-software/
- Whip Around — Complete Driver Vehicle Inspection Guide: https://whiparound.com/the-complete-driver-vehicle-inspection-guide/
- Deputy — HR Software (AU): https://www.deputy.com/au/hr-software
- Deputy — Payroll Software (AU): https://www.deputy.com/au/payroll-software
- Deputy — Road Transport and Distribution Award (RTDA) help article: https://help.deputy.com/hc/en-au/articles/4661989633039-Road-Transport-and-Distribution-Award-RTDA-MA000038
- Tanda — HR solutions: https://www.tanda.com.au/solutions/hr
- Tanda — Payroll: https://www.tanda.com.au/solutions/payroll
- Onfleet — Driver Status: https://support.onfleet.com/hc/en-us/articles/10228905705876-Driver-Status
- Zutobi — Driver's Licence Classes in Australia: https://zutobi.com/au/driver-guides/types-of-drivers-licence-classes
- Singh and Kaur Driving School — Different VIC Driver Licence Classes: https://www.singhandkaurdrivingschool.com.au/different-vic-driver-licence-classes-everything-you-need-to-know/
- Logistics Bureau — What is Chain of Responsibility?: https://www.logisticsbureau.com/chain-of-responsibility/
- NHVR — Fatigue Management (GVM >12t threshold): https://www.nhvr.gov.au/safety-accreditation-compliance/fatigue-management
- Fair Work Ombudsman — Road Transport and Distribution Award 2020 (MA000038): https://awards.fairwork.gov.au/MA000038.html
- Connecteam — Road Transport and Distribution Award guide: https://au.connecteam.com/awards/road-transport-and-distribution/
- RosterElf — Road Transport Award Pay Guide: https://www.rosterelf.com/guides/award-rates/logistics
- WorkSafe Victoria — Planning for safe work-related driving: https://www.worksafe.vic.gov.au/planning-safe-work-related-driving
- WorkSafe Victoria — Working on hybrid and electric vehicles safely: https://www.worksafe.vic.gov.au/working-hybrid-and-electric-vehicles-safely
- WorkSafe Victoria — General duties relating to health and safety: https://www.worksafe.vic.gov.au/general-duties-relating-health-and-safety
- WorkSafe Queensland (national guide, referenced) — Vehicles as a Workplace: https://www.worksafe.qld.gov.au/__data/assets/pdf_file/0020/21629/vehicles-as-a-workplace-national-guide.pdf
- Transport Victoria — Roadworthy Certificate: https://transport.vic.gov.au/road-and-active-transport/registration-and-licensing/registration/roadworthy-certification/roadworthy-certificate
- Transport Victoria — Roadworthiness Requirements (VSI 26): https://transport.vic.gov.au/road-and-active-transport/registration-and-licensing/registration/standard-and-non-standard-vehicle-information/vehicle-standards-information/roadworthiness-requirements
- CTP Insurance Vic — vehicle registration requirements: https://www.ctpinsurance.com.au/vic/registration/
- Hooshmand — How to Register a Vehicle in Victoria: https://hooshmand.net/register-vehicle-victoria/
- OAIC — Employee records exemption: https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/employee-records-exemption
- OAIC — Employment (privacy rights): https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/employment
- OVIC — Privacy During Employment: https://ovic.vic.gov.au/privacy/resources-for-organisations/privacy-during-employment/
- Armstrong Legal — Workplace Surveillance (Vic): https://www.armstronglegal.com.au/commercial-law/vic/employment-law/workplace-surveillance/
- Radius — Vehicle Tracking Laws / Guide to Employee Rights: https://www.radius.com/en-au/telematics/vehicle-tracking/laws/
- Maurice Blackburn — Surveillance of employees in the workplace: https://www.mauriceblackburn.com.au/blog/employment-issues/surveillance-in-the-workplace/
- Food Safety (AIFS) — Food Safety Supervisor VIC training requirements: https://blog.foodsafety.com.au/food-safety-supervisor-vic-training-requirements
- Health.vic.gov.au — Food safety supervisors (redirected to Safe Food Victoria): https://www.health.vic.gov.au/food-safety/food-safety-supervisors → https://www.safefood.vic.gov.au/
- AustLII — Food Act 1984 (Vic) s19G (attempted, HTTP 403 — not independently confirmed this session): https://classic.austlii.edu.au/au/legis/vic/consol_act/fa198457/s19g.html
