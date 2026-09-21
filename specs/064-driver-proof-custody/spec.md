# Feature Specification: Driver Proof of Delivery & Custody

**Feature Branch**: `064-driver-proof-custody`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Driver proof of delivery and custody — Slice D"

## Why this slice exists

**Nothing on the platform can evidence that a package was handed over, and nothing can record that it
was not.**

Slice C made work happen: a wave is planned, a driver collects from shops, checks the load in at the
hub, and a same-day round goes back out. What it deliberately did not build is the other half — the
record of what became of each package. Today a driver can mark a drop complete and the platform keeps
no evidence at all; and if a drop *cannot* be completed, there is no way to say so. The driver's only
options are to complete it falsely or to leave it open forever.

Three consequences are live right now:

1. **A completed delivery is an unevidenced assertion.** If a customer says "it never arrived", Effy
   has a status and nothing else. No photograph, no signature, no code, no time, no note.
2. **A failed delivery cannot be recorded.** The driver app has the screens; the platform has no
   route behind them. A package nobody could deliver stays "on the way" indefinitely, and nobody at
   Effy is told.
3. **Custody is broken at the hub.** A driver collects packages and checks them in, but that check-in
   is not modelled as work. Once the last shop stop is done the driver app has nothing outstanding to
   show, so a van full of goods looks identical to an empty one. This was found live on 2026-09-21: a
   driver collected everything, left the run screen, and had no way back to it.

This slice closes the loop from "the driver has it" to "we know what happened to it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete a delivery with proof (Priority: P1)

A driver arrives at a customer's address on a same-day round and completes the drop. Depending on
what they find, they capture proof in one of four ways: a **photograph** of where the package was
left, a **signature** from whoever received it, a **code** the customer reads out, or **contactless**
when the customer has asked for the package to be left. The proof is stored against that drop and the
order moves to delivered.

**Why this priority**: It is the single most common action in the whole delivery operation, it is the
point at which Effy's liability for a package ends, and it is the one thing a customer dispute turns
on. Without it every other part of the slice has nothing to attach to.

**Independent Test**: Assign a driver a same-day round, complete one drop with each of the four
methods in turn, and confirm each is stored, visible afterwards, and moves the order to delivered.

**Acceptance Scenarios**:

1. **Given** a driver at a drop with the customer present, **When** they capture a signature and
   complete the drop, **Then** the drop is delivered, the signature is retrievable against it, and
   the time of capture is recorded.
2. **Given** a driver at a drop the customer has asked to be left unattended, **When** they complete
   it contactlessly, **Then** a photograph is required before the drop can be completed.
3. **Given** a driver who has captured proof but has no signal, **When** connectivity returns,
   **Then** the proof is submitted exactly once and no duplicate delivery is recorded.
4. **Given** a drop already completed, **When** the same completion is submitted again, **Then** the
   platform reports the existing outcome rather than recording a second one.
5. **Given** a driver captures a photograph, **When** the upload fails, **Then** the drop is NOT
   marked delivered and the driver is told the proof did not save.

---

### User Story 2 - Record a delivery that could not be completed (Priority: P1)

A driver cannot complete a drop — nobody is home, the address is wrong, the customer refuses it, or
access is blocked. They record the attempt with a reason and an optional note. The package stays in
the driver's custody, returns to the hub at the end of the round, and Effy is told.

**Why this priority**: Equal-first with US1 because it is the case that currently has no
representation at all. A driver who cannot deliver has, today, only two choices: lie, or abandon the
drop. Both leave a shopper waiting on a package nobody is carrying.

**Independent Test**: Take a drop, record each failure reason in turn, and confirm the attempt is
stored, the package is not marked delivered, and the exception is visible to back-office.

**Acceptance Scenarios**:

1. **Given** a driver at a drop where nobody answers, **When** they record "nobody home",
   **Then** the drop is marked failed, the attempt is recorded with its time and reason, and the
   order does NOT become delivered.
2. **Given** a failed drop, **When** the driver finishes the round, **Then** the package is expected
   back at the hub and is shown as being in the driver's custody until it is.
3. **Given** a driver records a failure with a note, **Then** the note is stored and shown to
   back-office alongside the reason.
4. **Given** a drop that has already failed, **When** the driver reopens the round, **Then** the drop
   shows as failed and cannot be silently completed as delivered.

---

### User Story 3 - Back-office sees and acts on delivery exceptions (Priority: P2)

Back-office staff see every package that could not be delivered, with its reason, note, driver, time
and order. They can see which packages are back at the hub and which are still out. This is the
reader that makes US2 worth recording.

**Why this priority**: Recording an exception nobody reads is the exact defect Slice 056 was built to
fix — its own words: the driver app "has been recording exceptions for a reader that does not
exist." That reader was built against tables the Slice C teardown removed, so the capability is
currently unbuilt again. It is P2 only because US1 and US2 must exist before there is anything to
read.

**Independent Test**: Fail several drops for different reasons, then confirm each appears in
back-office with reason, note, driver, order and time, and that resolved ones drop off the list.

**Acceptance Scenarios**:

1. **Given** three drops failed for different reasons, **When** a staff member opens delivery
   exceptions, **Then** all three are listed with their reason, note, driver, order and time.
2. **Given** a failed drop whose package is back at the hub, **Then** the list shows it as returned
   rather than still in a van.
3. **Given** a staff member who is not permitted to act on exceptions, **When** they open the list,
   **Then** they can read it but cannot change anything.

---

### User Story 4 - Custody is continuous and never silently empty (Priority: P2)

At every moment between a package leaving a shop and reaching its destination, the platform can say
who holds it and what the next required action is. Specifically, a driver who has collected packages
but not yet checked them in at the hub sees the hub check-in as outstanding work, not as an empty
screen.

**Why this priority**: This is a live defect, not a new capability — found on 2026-09-21 with a
driver stranded holding thirteen packages and no way back into the run. It is P2 rather than P1 only
because a UI workaround is already in place; the underlying model is still wrong.

**Independent Test**: Complete every shop stop on a collection round, leave the run screen entirely,
return to the app, and confirm the hub check-in is presented as the outstanding next action.

**Acceptance Scenarios**:

1. **Given** a driver who has collected from every shop on their round, **When** they open the app,
   **Then** the hub check-in is shown as the remaining work with a count reflecting it.
2. **Given** a driver mid-round, **When** they go off duty and come back on, **Then** the round and
   its next required action are still reachable.
3. **Given** a driver holding packages, **When** anyone at Effy asks where those packages are,
   **Then** the platform names the driver and the time custody began.

---

### User Story 5 - Proof is retrievable after the fact (Priority: P3)

When a question is raised about a delivery — days or weeks later — the proof captured at the time can
be retrieved and viewed, together with the sequence of events for that package.

**Why this priority**: It is the payoff for US1, but the capture must exist before retrieval matters,
and a dispute arrives later than the delivery does.

**Independent Test**: Complete deliveries with each proof method, then retrieve each one afterwards
and confirm the media, method, note and time are all present and correct.

**Acceptance Scenarios**:

1. **Given** a delivery completed with a photograph, **When** it is retrieved later, **Then** the
   photograph is viewable and shows the capture time and method.
2. **Given** a delivery completed contactlessly or by code, **When** it is retrieved, **Then** the
   method and time are shown and the absence of media is explicit rather than an error.
3. **Given** proof captured more than 90 days ago and since archived, **When** it is retrieved,
   **Then** it is viewable exactly as a recent one is, with no restore step and no waiting.

### Edge Cases

- A driver captures proof for the wrong drop and notices immediately. There is no correction path in
  this slice; the proof stands and the discrepancy is a back-office exception.
- A photograph is captured but the round is reassigned to another driver before it is submitted.
- Two devices submit proof for the same drop at the same moment.
- A driver completes every drop but never returns the failed packages to the hub.
- A package is marked delivered while its order has already been cancelled or refunded.
- Proof media is requested for a delivery from years ago, long after it has been archived.
- A proof record exists but its media object does not — which, since nothing deletes media, means
  something is wrong rather than something expired.
- Storage is unavailable when a driver tries to upload a photograph.
- A driver's shift ends while packages are still in their custody.
- A signature is captured as an empty image because the screen was not touched.
- The same proof submission is retried after the platform has already accepted it.
- A drop fails, the package returns to the hub, and the same order is later delivered successfully.

## Requirements *(mandatory)*

### Functional Requirements

**Capturing proof**

- **FR-001**: A same-day drop MUST NOT be completable without proof. **Amended 2026-09-21 (planning,
  research R4): this slice ships THREE methods — photograph, signature and contactless.** The `code`
  method is deferred; see FR-003.
- **FR-002**: A contactless completion MUST require a photograph. Leaving a package unattended with
  no evidence of where it was left is the case most likely to become a dispute.
- **FR-003**: ⚠ **DEFERRED — NOT MET BY THIS SLICE (amended 2026-09-21, research R4).** A code
  completion would have to verify the code against the one issued for that order — and **no delivery
  code exists anywhere on the platform**: `delivery_code` appears in no service, migration, contract
  or app. Issuing one means showing it to the customer in advance, which is a change on both customer
  surfaces, and FR-027 has deliberately scoped customer-facing delivery information out of this
  slice.
  Building the method anyway would produce a gate that looks enforced and compares a value to
  itself. Until the code is issued, the platform MUST refuse a `code` submission with an explicit,
  named refusal rather than accepting it, and the driver app MUST NOT offer the option. The deferral
  MUST be pinned by a test, so that the entry cannot outlive the gap it describes.
- **FR-004**: Every proof record MUST carry the method, the capturing driver, the time of capture and
  the drop it belongs to.
- **FR-005**: A proof submission MUST be idempotent per driver action: resubmitting the same action
  MUST report the original outcome and MUST NOT record a second delivery.
- **FR-006**: A drop MUST NOT be marked delivered unless its proof has been stored successfully. A
  failed upload MUST leave the drop incomplete and MUST say so.
- **FR-007**: Proof media MUST be captured at a quality sufficient to identify a doorstep or read a
  signature, and MUST be size-bounded so that capture succeeds on a mobile connection.
- **FR-008**: The platform MUST accept proof captured while offline once connectivity returns, and
  MUST NOT lose a capture because the app was closed in between.

**Recording a failure**

- **FR-009**: A driver MUST be able to record a drop as not completed with one of a closed set of
  reasons: nobody home, wrong address, customer refused, access blocked, or other.
- **FR-010**: A failure reason of "other" MUST require a note; the remaining reasons MUST allow one.
- **FR-011**: Recording a failure MUST NOT mark the order delivered and MUST NOT discard the package
  — the package remains in the driver's custody.
- **FR-012**: Every failure MUST be recorded with its reason, note, driver, drop, order and time.
- **FR-013**: A failed drop MUST remain visibly failed for the rest of the round and MUST NOT be
  completable as delivered without a new attempt being recorded.

**Custody**

- **FR-014**: The platform MUST be able to state, for any package between shop and destination, who
  holds it and since when.
- **FR-015**: Hub check-in MUST be modelled as outstanding work on a collection round, so that a
  driver who has collected everything still has a stated next action.
- **FR-016**: A driver MUST be able to reach their current round and its next required action at any
  time while it is open, regardless of what they did in between.
- **FR-017**: A package that failed delivery MUST be tracked as owed back to the hub until it is
  checked in.
- **FR-018**: A driver MUST NOT be able to end their shift silently while holding packages; the
  platform MUST state what they are holding.

**Reading exceptions**

- **FR-019**: Back-office staff MUST be able to list every delivery that could not be completed, with
  reason, note, driver, order, destination and time.
- **FR-020**: The exception list MUST distinguish packages still in a driver's custody from those
  returned to the hub.
- **FR-021**: Reading exceptions MUST be available to any active staff member; acting on one MUST be
  restricted to staff permitted to change an order's fate.
- **FR-022**: An exception MUST leave the list once its package has been resolved, and the record MUST
  remain retrievable afterwards.

**Retrieval and retention**

- **FR-023**: Proof MUST be retrievable against its delivery afterwards, showing method, time, note
  and media where media exists.
- **FR-024**: Access to proof media MUST be restricted to those entitled to see it, and MUST NOT be
  reachable by anyone holding only a guessable identifier.
- **FR-025**: ⚠ **REVISED 2026-09-21 (operator direction): proof media MUST NOT be deleted.** It is
  evidence, and it MUST remain available for audit and for any legal question raised about a
  delivery. Media MUST move to **archival storage after 90 days** — the point at which the active
  dispute window has closed, since a submitted refund can be rejected up to 30 days later (055) —
  and MUST remain retrievable from there.
  ⚠ Archival MUST NOT change how proof is read: retrieval from the archive tier MUST be available
  on demand without a restore step, so that no read path has two behaviours depending on an object's
  age.
- **FR-026**: ⚠ **REVISED 2026-09-21 alongside FR-025.** Because media is never deleted, a proof
  record MUST always be able to produce its media where media was captured. A missing object is
  therefore an **error condition to be alarmed on**, not an expected state to be rendered — the
  opposite of what this requirement said when retention was time-limited. Contactless proof captured
  without an image remains the one legitimate case of a proof with no media, and MUST be distinguished
  from media that should exist and does not.
- **FR-027**: Proof MUST NOT be visible to a customer in this slice — neither the media nor the
  method. Showing a shopper the proof of their own delivery is ordinary industry practice and reduces
  disputes, and it is expected to arrive in a later slice; it is excluded here because it is a
  capability on two customer surfaces with its own access rules, and adding it would widen a slice
  whose purpose is to make custody evidenced at all. Nothing in this slice may foreclose it: the
  proof record MUST be structured so that exposing method and time to a customer later requires no
  change to how proof is captured or stored.

**Throughout**

- **FR-028**: No proof, failure or custody record MUST contain a driver's location. The platform
  captures no location data anywhere and this slice introduces none.
- **FR-029**: An action that changes a package's fate MUST be attributable to the person who took it.

### Key Entities *(include if feature involves data)*

- **Proof of delivery** — evidence that a drop was completed: its method, the media it produced (if
  any), an optional note, the driver, and the moment of capture. Belongs to exactly one drop.
- **Delivery attempt failure** — a record that a drop could not be completed: its reason, an optional
  note, the driver and the time. A drop may accumulate more than one over its life.
- **Custody holding** — who physically holds a package and since when, from the moment it leaves a
  shop until it reaches its destination or returns to the hub.
- **Hub check-in** — the custody handover from a driver to the hub, now a required step of a
  collection round rather than an event that may or may not be recorded.
- **Proof media** — the photograph or signature image produced by a capture, held separately from the
  record that describes it. Retained indefinitely as evidence, moving to archival storage once the
  active dispute window has closed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of completed same-day deliveries carry proof, by one of the three methods this
  slice ships. A delivery with no proof is not representable.
- **SC-002**: A driver can complete a drop with proof in under 30 seconds from arriving at the drop
  screen, including capturing a photograph.
- **SC-003**: 100% of drops that could not be completed carry a reason, and every one of them appears
  to back-office within one minute of being recorded.
- **SC-004**: At any moment, for every package between shop and destination, the platform can name
  who holds it. There is no state in which a package is held by nobody.
- **SC-005**: A driver who has collected packages and not yet checked them in always has a stated
  next action, verified by leaving the app entirely and returning.
- **SC-006**: Proof captured offline is submitted exactly once, verified by capturing with
  connectivity disabled, closing the app, and restoring connectivity.
- **SC-007**: No duplicate delivery is ever recorded, verified by submitting the same completion
  concurrently from two devices.
- **SC-008**: Proof captured at delivery is retrievable and correct 30 days later.
- **SC-009**: Proof media cannot be reached by anyone not entitled to it, verified by attempting
  access with a valid session belonging to a different driver and to a different audience.
- **SC-010**: A driver holding packages is told what they are holding before their shift can end.
- **SC-011**: A failed delivery never causes its order to report as delivered, verified across every
  failure reason.
- **SC-012**: ⚠ **REVISED 2026-09-21.** Proof media captured more than 90 days ago is in archival
  storage, and is still retrievable on demand with no restore step and no change to how it is read.
  Verified on both halves — that the object has actually moved to the archive tier, and that a read
  of it succeeds exactly as a recent one does. An archive nobody has read back is not an archive; it
  is an assumption.

## Assumptions

- ⚠ **The delivery code does NOT exist — this assumption was wrong and was corrected in planning.**
  049 recorded walking a code-based proof, but whatever carried it went with 063's teardown, and a
  repo-wide search now returns nothing. Contactless is re-established; the code method is deferred
  (FR-003, research R4).
- **The driver app's proof screens already exist.** Slice 060 built all forty-five screens. This
  slice supplies what they submit to and display from; it does not design new screens.
- **The wire contract for proof already exists** and is treated as the target shape rather than
  something to redesign: four methods, a media key, a code, a note, and an idempotency key per
  action.
- ⚠ **Camera and signature capture ALREADY EXIST — this assumption was wrong and was corrected in
  planning.** `PhotoCapture`, `CameraPreviewSurface`, `PngEncode`, `PermissionRequester` and
  `ImageUpload` are all present with both Android and iOS implementations, built by 049 and 060. This
  slice wires them; it does not build them (research R8).
- **Re-attempt scheduling is out of scope**, as Slice 063 stated. A failed delivery is recorded and
  surfaced; deciding what happens next is a human decision made in back-office, and automating it is
  a later slice.
- **The customer is not notified of a failed delivery by this slice.** Slice 056 recorded that gap
  explicitly as closed for Effy and open for the shopper; it remains open.
- **Standard packages leave the driver app at hub check-in**, unchanged from Slice 063. Their onward
  custody belongs to an external carrier and is not evidenced here.
- **A drop belongs to exactly one order**, so proof attaches to a drop without ambiguity.
- **Media is held separately from the records that describe it**, so storage class and lifecycle are a
  property of the image alone and the delivery's history is unaffected by where the image lives.
- **Failure reasons are a closed set.** A free-text reason would be unreportable in aggregate, which
  defeats the purpose of the exception list.
- **Times are judged in the platform's operating timezone**, as every other driver-facing time is.

## Out of Scope

- Re-attempt scheduling and automatic rebooking of failed deliveries.
- Notifying the customer that a delivery failed, or of driver progress generally.
- Customer-facing display of proof.
- Proof for standard packages after they leave the hub, and any carrier tracking.
- Correcting or retracting proof once captured.
- Any capture or use of driver location.
- Identity verification of the person receiving a package beyond a signature or code.
- Age-restricted or high-value handover rules.
- Multi-hub custody transfer.
