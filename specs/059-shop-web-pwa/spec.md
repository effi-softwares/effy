# Feature Specification: Shop Console as an Installable, Notifying Production App

**Feature Branch**: `059-shop-web-pwa`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "i want to make this shop-web app full production ready PWA application. every feature should work exactly, and also i want to have push notification support as well. when new order came or new attention came. do a research on how to do those things in industry standard way and make plan to do it"

---

## Context — what is true today

The shop console is the surface an Effy shop operator works from all day, on a tablet, on a shop
floor. Three facts about its current state shape this slice:

1. **It is a browser tab and nothing more.** It cannot be installed, it has no icon on a home
   screen, it occupies a tab beside everything else the tablet is doing, and closing that tab ends
   the operator's contact with Effy until they think to open it again.

2. ⚠ **The platform already decides a shop must be told about a new order — and nobody is told.**
   Every paid order enqueues one "new order" notification intent per active staff member of each
   fulfilling shop. The delivery step then resolves those intents to registered devices, and a
   browser is not a kind of device the platform can register. So for a shop whose operators work on
   the web console — which is every shop, since the mobile app is not the console — each of those
   intents is recorded, attempted, and **discarded as "nobody to send to"**. The decision to notify
   has been made and stored since the push foundation shipped; only the arrival is missing. This is
   not a new capability so much as an unfinished one.

3. **Live updates exist, but only while someone is looking.** The console refreshes itself the
   moment its shop's data changes — as long as the tab is open and in front of the operator. The
   whole class of "nobody is looking right now" is exactly what a notification is for, and there is
   no mechanism for it.

The consequence is a queue that is only as fresh as somebody's habit of checking it. An order placed
at 4:10 pm is discovered when an operator next glances at a tab, and the same is true of an empty
shelf or a refund waiting on approval.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A new order reaches the operator who is not looking (Priority: P1)

An operator is working away from the console — serving a walk-in customer, restocking a shelf, or
the tablet has gone to sleep. A customer places an order that this shop must fulfil. Within seconds
the operator's device shows a notification saying a new order has arrived. Tapping it opens the shop
console directly on that order.

**Why this priority**: It is the entire point of the request, and it is the one thing that changes
the shop's working day: the console stops being something you remember to check and becomes
something that tells you. It also closes a standing platform defect — intents already being written
and thrown away.

**Independent Test**: With the console closed and the tablet locked, place a paid order for the
shop; a notification arrives on the device and opens the console on that order. Fully testable
without any other story in this slice.

**Acceptance Scenarios**:

1. **Given** an operator has enabled notifications on a device, **When** a customer's paid order
   includes items this shop fulfils, **Then** that device shows a notification naming it as a new
   order, within seconds of payment.
2. **Given** the notification is showing, **When** the operator activates it, **Then** the console
   opens focused on that order — reusing an already-open console window rather than opening a second
   one.
3. **Given** two operators at the same shop have both enabled notifications, **When** one order
   arrives, **Then** both are notified, and neither notification is suppressed by the other.
4. **Given** the same order's notification is delivered more than once because of a retry, **When**
   it arrives, **Then** the operator sees one notification, not two.
5. **Given** an operator has *not* enabled notifications, **When** an order arrives, **Then**
   nothing is shown on their device and the console behaves exactly as it does today.
6. **Given** the console is open and in front of the operator when the order arrives, **When** the
   notification would fire, **Then** the operator is not shown a duplicate system notification for
   something already visible on screen.

---

### User Story 2 — The console installs onto the tablet and behaves like the shop's app (Priority: P1)

An operator installs the console onto the tablet's home screen. It opens in its own window with no
browser chrome, shows the Effy shop mark, restores the operator's signed-in session, and is
indistinguishable from an app the shop was given.

**Why this priority**: It is the second half of US1, not a cosmetic extra. On the tablets this
audience actually uses, notification permission cannot even be requested until the console has been
installed to the home screen — so on those devices US1 has no route to the operator without this
story. It is also what makes the console reachable in one tap instead of through a browser.

**Independent Test**: Install the console on a tablet from the browser's own install affordance,
launch it from the home screen, confirm it opens standalone, branded, and signed in.

**Acceptance Scenarios**:

1. **Given** an operator is signed in to the console in a browser, **When** they install it,
   **Then** an Effy shop icon appears on the home screen.
2. **Given** the console is installed, **When** it is launched from the home screen, **Then** it
   opens in its own window with no browser address bar or tab strip.
3. **Given** it was launched from the home screen, **When** it opens, **Then** the operator's
   session is still active and they land on Today without signing in again.
4. **Given** the operator is on a device where installing is a manual, undiscoverable gesture,
   **When** they are in the console, **Then** the console tells them how to install it, and stops
   telling them once it is installed.
5. **Given** the operator has dismissed the install prompt, **When** they return later, **Then**
   they are not nagged on every visit.
6. **Given** the console is installed and a new version has been deployed, **When** the operator next
   opens it, **Then** they are running the new version — never a stale one indefinitely.

---

### User Story 3 — Something needs the shop's attention and the shop is told (Priority: P2)

Beyond new orders, four situations already make the console's "Needs attention" card say something
is wrong: orders are waiting to be picked, a product has run out, a product has fallen below its
reorder point, and a refund is waiting for a manager's approval. When one of these crosses into
needing a human, the operator is notified — without being notified again about the same thing every
few minutes.

**Why this priority**: It is explicitly requested and it is where the shop actually loses money —
an empty shelf is lost sales in the present tense. It is second to US1 because it is far harder to
get right: attention conditions persist for hours, so a naive implementation notifies continuously
and trains the operator to dismiss everything, which is worse than silence. It depends on nothing in
US1 beyond the delivery mechanism.

**Independent Test**: Drive a shop into each attention condition and confirm exactly one
notification per situation, correctly worded, opening on the screen that resolves it.

**Acceptance Scenarios**:

1. **Given** an attention condition is configured to notify, **When** it first becomes true for this
   shop, **Then** the operator is notified once, and the notification opens the screen where the
   situation is resolved.
2. **Given** an attention condition has already notified and is still true, **When** time passes,
   **Then** the operator is not notified about it again.
3. **Given** an attention condition was resolved and later becomes true again, **When** it does,
   **Then** the operator is notified again — the earlier notification does not silence it forever.
4. **Given** several attention conditions become true at once, **When** they do, **Then** the
   operator is not buried in a burst of separate notifications.
5. **Given** a refund is waiting for approval and the operator is not a manager, **When** the
   notification would fire, **Then** they are not notified about a decision they cannot make.

---

### User Story 4 — The operator controls what interrupts them (Priority: P2)

An operator turns notifications on or off per device, chooses which kinds they want, and can turn
them off entirely without signing out. A manager's device and a picker's device can be set
differently.

**Why this priority**: A notification the operator did not consent to is an interruption, and a
console that interrupts wrongly gets its notifications turned off at the operating-system level —
after which nothing this slice builds can ever reach that person again. The control is what protects
US1 and US3 from being switched off wholesale.

**Independent Test**: Toggle each notification kind on one device and confirm delivery follows the
setting on that device only.

**Acceptance Scenarios**:

1. **Given** an operator has never been asked, **When** they open the console, **Then** the system
   permission prompt is not fired at them unprompted — they are first told what they would receive,
   and ask for it deliberately.
2. **Given** an operator turns notifications off in the console, **When** a qualifying event occurs,
   **Then** their device shows nothing and the platform stops attempting delivery to it.
3. **Given** an operator has two devices, **When** they change the setting on one, **Then** the
   other is unaffected.
4. **Given** an operator blocked notifications at the operating-system level, **When** they open the
   console's notification settings, **Then** the console says so plainly and does not present a
   toggle that cannot work.
5. **Given** an operator signs out, **When** they do, **Then** that device stops receiving this
   shop's notifications.

---

### User Story 5 — The console survives a bad network (Priority: P3)

The tablet's connection drops — a shop's back room, a saturated retail wifi network, a router
reboot. The console does not become a blank error page. It says it is offline, keeps showing what it
last loaded, and recovers on its own when the connection returns.

**Why this priority**: It is what "production ready" means on a shop floor as opposed to a desk, and
it is what an installed app is judged against — an installed icon that opens to a browser error is
worse than a tab. It is P3 because the console remains usable for its core purpose while connected,
which is most of the time.

**Independent Test**: Load the console, disconnect the network, navigate, reconnect; confirm no dead
end at any point and no stale data presented as current.

**Acceptance Scenarios**:

1. **Given** the console is open, **When** the network drops, **Then** the operator is clearly told
   they are offline and is not shown an unexplained error.
2. **Given** the console is offline and showing data loaded earlier, **When** the operator reads it,
   **Then** it is visibly marked as last-known rather than presented as current.
3. **Given** the console is offline, **When** the operator attempts an action that changes something,
   **Then** they are told it cannot be done right now — never told it succeeded when it did not.
4. **Given** the console was launched from the home screen while offline, **When** it opens, **Then**
   it renders its own offline state rather than the browser's error page.
5. **Given** the network returns, **When** it does, **Then** the console recovers current data
   without the operator reloading it by hand.

---

### User Story 6 — Every console feature is verified against a real shop (Priority: P1)

Each capability the console claims — sign-in, Today, the order console, picking and fulfilment,
catalog and product detail, stock, insights, team, refunds — is exercised end to end by a person
against live data, and every defect found is fixed.

**Why this priority**: The console's features are machine-verified and, in the operator's own
record, **have never been looked at by a person**; the platform has previously shipped four live
defects behind a fully green test suite. "Every feature should work exactly" is not a build task, it
is a verification task, and none of the other stories mean anything on top of features that do not
work. It is listed last because it is a pass *over* the others, but it is P1.

**Independent Test**: Walk the console's published capability register screen by screen against a
live shop; record each as working or defective; fix the defects.

**Acceptance Scenarios**:

1. **Given** the capability register lists what this surface can do, **When** the walk is complete,
   **Then** every entry has been exercised by a person and recorded as passed or fixed.
2. **Given** a defect is found during the walk, **When** it is fixed, **Then** a test exists that
   fails without the fix.
3. **Given** a claimed capability turns out to be impossible or wrong, **When** that is discovered,
   **Then** the claim is corrected rather than the behaviour faked.

---

### Edge Cases

- **The tab is open and looking at the very thing.** An order arrives while the operator is staring
  at the order queue. Notifying them is noise; the screen already updated.
- **Permission granted, delivery address dead.** The operator wiped the tablet, or the browser
  discarded the subscription. The platform must stop treating a dead address as a live one and must
  not keep reporting success.
- **The operator is signed out but the device is still registered.** A notification for a shop they
  no longer belong to must not arrive, and activating a stale one must not show that shop's data.
- **A shared tablet.** Two operators use one tablet at different times. A notification must not be
  delivered for a person who is not signed in on it.
- **The operator changes shop, or is stood down.** Notifications for the old shop must stop.
- **A burst.** Twenty orders land in one minute at a busy hour. The operator must not receive twenty
  separate interruptions.
- **Out of hours.** An order or an attention item occurring when the shop is closed.
- **A push arrives that resolves to nothing showable.** Some platforms revoke notification
  permission from an app that receives a push and shows nothing, so "receive and stay silent" is not
  a safe option.
- **A stale installed copy.** An installed console that keeps running an old version after a deploy
  — including one that no longer matches the backend it talks to.
- **Sign-in inside an installed window.** The sign-in step involves a one-time emailed code; the
  operator must be able to complete it in a window with no address bar, including when reading the
  code takes them to another app and back.
- **Storage cleared.** The device clears site data; the console must recover to a working signed-out
  state, not a broken one.
- **Two windows.** The console open both as an installed app and as a browser tab.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Installability and app identity

- **FR-001**: The console MUST be installable onto a device's home screen or desktop from the
  browser, on the platforms Effy shop operators use.
- **FR-002**: When launched from the home screen, the console MUST open in its own window without
  browser navigation chrome.
- **FR-003**: The installed console MUST carry the Effy shop brand identity — its icon, its name,
  and its launch appearance — consistent with the shop mobile app, so one audience sees one brand.
- **FR-004**: The console MUST restore the operator's existing session when launched from the home
  screen; installation MUST NOT require signing in again.
- **FR-005**: The console MUST support completing sign-in — including leaving to read an emailed
  code and returning — entirely within the installed window.
- **FR-006**: The console MUST guide the operator through installation on devices where the gesture
  is manual and undiscoverable, and MUST stop offering that guidance once installed or once declined.
- **FR-007**: The console MUST remain fully usable as an ordinary browser tab; installation MUST be
  optional and MUST NOT gate any capability other than those the device itself gates.
- **FR-008**: The console MUST NOT become search-discoverable as a result of this slice; it remains
  an internal, login-gated surface.

#### Staying current

- **FR-009**: An installed console MUST detect that a newer version has been deployed and MUST run
  it, without the operator clearing data or reinstalling.
- **FR-010**: The console MUST NOT swap versions underneath an operator in the middle of an action
  in a way that loses their work.
- **FR-011**: The console MUST NOT serve an indefinitely stale version of itself; a deployed fix MUST
  reach every installed device within one working day without operator action.

#### Notifications — new orders

- **FR-012**: When an order is paid and includes items a shop must fulfil, every operator of that
  shop who has enabled notifications MUST receive one on each of their enabled devices.
- **FR-013**: A new-order notification MUST identify itself as a new order and MUST carry enough to
  act on — at minimum how many items and how urgent — without disclosing the customer's identity,
  address, or contact details.
- **FR-014**: Activating a new-order notification MUST open the console focused on that order, and
  MUST reuse an already-open console window rather than opening another.
- **FR-015**: Delivery MUST be idempotent: a repeated or retried delivery of the same event MUST
  produce one notification, not several.
- **FR-016**: Notifications MUST NOT be sent to an operator who is not currently an active member of
  the shop the event concerns.

#### Notifications — attention

- **FR-017**: The console MUST notify an operator when one of the shop's recognised attention
  conditions newly requires a human: orders waiting to be picked, a product out of stock, a product
  below its reorder point, and a refund awaiting approval. **All four notify** (operator decision,
  2026-09-19).
- **FR-017a**: ⚠ Because all four notify, and because the two stock conditions can stay true for
  days while the two order conditions resolve within an hour, the four MUST NOT be treated as one
  kind. Each MUST be independently switchable by the operator (FR-024), and the slowest-moving of
  them MUST NOT be able to crowd out the most urgent — a shop with forty products below their
  reorder point MUST NOT produce forty interruptions, nor bury an order that has to leave.
- **FR-018**: An attention condition MUST notify once per occurrence. While the condition remains
  continuously true, it MUST NOT notify again.
- **FR-019**: A condition that is resolved and later recurs MUST be able to notify again.
- **FR-020**: Several attention conditions arising close together MUST be coalesced so the operator
  receives a bounded number of interruptions rather than one per item — including the case where a
  single stock count or delivery drops many products below their thresholds at once.
- **FR-021**: An attention notification MUST open the screen on which that situation is resolved.
- **FR-022**: A notification about an action only a manager may take MUST NOT be sent to an operator
  who cannot take it.

#### Notification hygiene and control

- **FR-023**: The console MUST NOT request system notification permission unprompted. It MUST first
  explain what would be sent and MUST request permission only in response to a deliberate operator
  action.
- **FR-024**: Operators MUST be able to enable and disable notifications from within the console,
  and to choose which kinds they receive — new orders and each of the four attention conditions
  being independently switchable, so an operator who wants to be told about an unpicked order but
  not about a slow-moving reorder point can have exactly that.
- **FR-025**: These choices MUST apply to the device they were made on; one operator's two devices
  MUST be independently controllable.
- **FR-026**: Where the operator has blocked notifications outside the console, the console MUST say
  so plainly and MUST NOT present a control that cannot take effect.
- **FR-027**: Signing out MUST stop that device receiving notifications for that shop.
- **FR-028**: The platform MUST detect a delivery address that has become permanently invalid and
  stop using it, rather than accumulating dead addresses or reporting failed delivery as success.
- **FR-029**: Every notification the platform delivers MUST result in something visible to the
  operator; the platform MUST NOT deliver a notification that is then silently discarded.
- **FR-030**: The console MUST NOT raise a system notification for an event the operator is
  demonstrably already watching on screen.
- **FR-031**: Notification content MUST carry no customer personal data, and MUST NOT expose data
  belonging to any shop other than the recipient's own.
- **FR-032**: Where the operating system supports an unread count on the app icon, the console MUST
  keep it consistent with the number of things actually awaiting the operator, and MUST clear it
  when they are dealt with.

#### Behaviour on a poor network

- **FR-033**: The console MUST tell the operator when it is offline, distinguishably from any other
  error.
- **FR-034**: An installed console launched while offline MUST render its own offline state, not the
  browser's network error page.
- **FR-035**: Data shown while offline MUST be marked as last known rather than presented as current.
- **FR-036**: The console MUST refuse an action that changes data while offline, and MUST NOT report
  such an action as having succeeded. ⚠ **Refusing is the requirement, not a limitation to be
  worked around** (operator decision, 2026-09-19): a pick recorded on a tablet and sent an hour
  later is a claim about a shelf that another operator may have emptied in between, and the platform
  has no conflict rule that could settle it. Queued offline writes are in Out of Scope.
- **FR-037**: The console MUST recover current data automatically when connectivity returns, without
  a manual reload.

#### Production readiness of existing capabilities

- **FR-038**: Every capability the shop console's parity register claims for this surface MUST be
  exercised end to end by a person against live data, and the register updated to reflect what was
  actually observed. **The scope is what the register already claims for this surface** (operator
  decision, 2026-09-19) — capabilities it marks as outstanding on shop-web are not built here.
- **FR-038a**: The walk MUST cover the capabilities that are built but have never been exercised by
  a person, including those carried as open operator items by earlier slices; a capability marked
  delivered on the strength of a passing test suite alone does not satisfy FR-038.
- **FR-039**: Every defect found during that walk MUST be fixed, or explicitly recorded as deferred
  with a reason — a known defect left silently in place is not permitted.
- **FR-040**: A claimed capability that proves impossible MUST have its claim corrected rather than
  its behaviour simulated.

### Key Entities

- **Device notification registration**: the association between one operator, one browser on one
  device, and the delivery address notifications for them are sent to. Created when the operator
  enables notifications; removed on sign-out, on disablement, or when the address is found dead.
  Holds no personal data beyond the operator's identity within the platform.
- **Notification preference**: which kinds of notification a given registration wants. Set by the
  operator, scoped to that registration.
- **Notification intent**: the platform's already-existing record that someone should be told
  something. This slice adds attention-derived intents to the existing order-derived ones, and gives
  both a route to a browser.
- **Attention occurrence**: the fact that a particular attention condition, for a particular shop,
  began requiring a human at a particular time — the thing that makes "notify once per occurrence,
  again on recurrence" answerable rather than guessed.
- **Installed console version**: which build of the console a given installed device is running,
  and whether it is current.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the console closed and the device asleep, a paid order reaches the operator's
  device as a notification in **under 30 seconds**, measured from payment, in **19 of 20** attempts.
- **SC-002**: Activating a new-order notification lands the operator on that order in **one action**,
  with no intermediate navigation.
- **SC-003**: An operator installs the console and reaches Today from the home screen in **under 60
  seconds** from a standing start, **without signing in again**.
- **SC-004**: Across a full trading day at a shop in normal operation, an operator receives **no more
  than one notification per distinct situation**, and **zero** notifications about situations they
  cannot act on.
- **SC-005**: In a burst of 20 orders within one minute, the operator receives **no more than 5**
  separate interruptions.
- **SC-006**: **Zero** notifications delivered in testing contain customer personal data or any other
  shop's data, verified by inspecting the delivered payloads.
- **SC-007**: With the network disconnected, **every** console screen reachable in the previous
  session renders a readable state — **zero** blank pages, browser error pages, or unexplained errors.
- **SC-008**: An action attempted while offline is refused with a clear message in **100%** of
  attempts; **zero** offline actions are reported as successful.
- **SC-009**: A deployed change reaches an installed device **within one working day** without the
  operator reinstalling or clearing data, confirmed by observing the change appear on a device that
  installed the previous version.
- **SC-010**: **100%** of the capabilities the parity register claims for the shop console have been
  exercised by a person against live data, and the register states the observed result for each.
- **SC-011**: Every defect found during that walk is either fixed with a test that fails without the
  fix, or recorded as deferred with a stated reason — **zero** silently known defects.
- **SC-012**: An operator who never enables notifications sees **no change** in console behaviour
  from before this slice.
- **SC-013**: After an operator disables notifications or signs out, **zero** further notifications
  reach that device.
- **SC-014**: **Zero** notification permission prompts are raised without a preceding deliberate
  operator action.

---

## Assumptions

- **The audience is Effy's own staff on shop-owned devices**, primarily tablets, on the shop floor.
  They are logged in for a whole shift. This is not a consumer app and is not subject to consumer
  install-conversion concerns.
- **The console keeps its existing deployment shape and address.** It is already served over a
  secure connection at its own subdomain, which is the precondition for both installation and
  notifications. Nothing in this slice moves it.
- **The existing live-update stream stays.** Notifications cover the case where nobody is looking;
  the live stream covers the case where somebody is. They are complementary, and the console will
  need to know which situation it is in to satisfy FR-030.
- **The platform's existing notification pipeline is reused, not replaced.** It already decides who
  should be told what, records intents, retries, and reports outcomes. This slice adds a delivery
  destination it does not currently have, and a new class of intent.
- **New-order intents are already produced** by the payment path for every active staff member of
  each fulfilling shop. No new decision about *who* gets a new-order notification is needed — only
  a route to them.
- **Attention intents are not produced by anything today.** The console derives attention conditions
  when somebody asks for them; nothing records when one *began*. Notifying once per occurrence
  therefore requires the platform to start recording occurrences, which is new.
- **On some operator devices — specifically tablets in the Apple ecosystem — notification permission
  cannot be requested at all until the console is installed to the home screen.** This is why US2 is
  P1 rather than a convenience, and it makes installation a functional prerequisite of US1 on those
  devices rather than a nice-to-have.
- **Some platforms penalise an application that receives a notification and shows nothing**, up to
  revoking its permission. FR-029 exists because of this; "receive quietly and just refresh" is not
  available.
- **Browsers increasingly rate-limit notification senders whose notifications go unengaged.** FR-018,
  FR-020, FR-022 and FR-030 are not only courtesies to the operator — over-notifying risks the
  platform's ability to notify at all.
- **Offline support in this slice is about not breaking, not about working disconnected**
  (operator decision, 2026-09-19). The console is assumed to be online during normal operation; the
  requirement is that a dropout is survivable and honest, not that a shift can be run offline.
- **Shop opening hours are not modelled on the platform** in a form this slice can use for quiet
  hours, so no quiet-hours behaviour is specified. An operator who does not want to be notified
  outside their shift turns notifications off on their device.
- **Notification wording is English only**, consistent with every other surface today.
- **The shop mobile app is unaffected.** It already receives these notifications through the mobile
  path and is not changed by this slice; the capability register must show both surfaces.

---

## Decisions taken (2026-09-19)

Three questions were put to the operator during specification. All three are settled; they are
recorded here so a later reader does not reopen them as oversights.

| Question | Decision | Consequence |
|---|---|---|
| What does "every feature should work exactly" cover? | **Verify and fix what the parity register already claims for shop-web.** | US6 is a walk-and-fix pass over built capabilities, absorbing the open operator walks earlier slices carry. Capabilities the register marks outstanding on this surface are not built here (FR-038, FR-038a). |
| How deep does offline go? | **Survive a dropout; refuse writes.** | Reads stay available and marked stale; any change is refused, never queued. A queued pick is a claim about a shelf another operator may have emptied, and no conflict rule exists to settle it (FR-036). |
| Which attention conditions notify? | **All four** — orders awaiting pick, out of stock, below reorder point, refund awaiting approval. | Widens US3 to the full set, which makes the hygiene requirements load-bearing rather than precautionary: the four must be independently switchable and independently rate-limited, or the slowest will train operators to ignore the most urgent (FR-017a, FR-020, FR-024). |

---

## Out of Scope

- Any change to the customer, driver, or back-office surfaces.
- Notifying customers or drivers about anything.
- Working a full shift offline: queued offline writes, conflict resolution, or local mutation of
  orders, picks or stock while disconnected.
- Publishing the console to an app store in any form.
- Quiet hours, shift schedules, or on-call rotation.
- Notification digests, summaries, or per-shop escalation to a manager when nobody responds.
- Multi-language notification content.
- Changing which events the platform considers worth telling a shop about, beyond the four attention
  conditions the console already recognises.

---

## Dependencies

- The console is deployed and reachable over a secure connection at its own address — already true.
- The platform's notification pipeline and its scheduled delivery worker — already built.
- The console's live-update stream — already built; needed to satisfy FR-030.
- The shop capability parity register — the artifact FR-038 and SC-010 are measured against.
- **Operator-supplied credentials for whatever delivery service is chosen** will be required before
  any notification can be sent; the platform does not hold them today and must not invent them.
- A real shop with live data, and a person willing to walk the console, are prerequisites of US6 —
  it cannot be satisfied by any amount of automated testing.
