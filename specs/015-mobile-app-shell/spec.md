# Feature Specification: Mobile App Shell & Navigation (Customer + Shop)

**Feature Branch**: `015-mobile-app-shell`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "A robust, reliable app shell for both the customer mobile app and the shop mobile app. Both get a production-grade, industry-standard bottom navigation hosting the main pages (home, profile/settings, search…). Customer app: some features are usable without a session (login/signup, product browsing, searching, deals) — the shell has public routes AND authenticated-only routes (profile, orders). Shop app: only the login screen is public; every other route requires an authenticated session. Deep research on robust, scalable navigation + app shell as used by the biggest apps (Uber Eats / eBay), highly reliable and fast. Then wire the authentication pages and app shell into each app per its auth rules."

## Reference doctrine *(constitution v1.9.0, Principle V)*

This feature is built to **DOCTRINE-1** (model the navigation, shell, and UX on how **Uber Eats** and
**eBay**-class production apps solve app navigation and guest-vs-authenticated access; prefer the
industry-standard pattern) and **DOCTRINE-2** (no card-style layouts; sectioned screens, lists, and
detail rows — no metric/summary cards at the top of a page).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Customer uses the app as a guest (Priority: P1)

A person opens the **customer app** without an account. They land in a **navigable shell** with a
persistent primary navigation (a **bottom bar** on a phone) exposing the app's main destinations. As a
guest they can move freely through the **public** destinations (Home, Search) and any public content
(browsing, deals) without ever being forced to sign in first. The navigation is instant, remembers
where they were in each destination, and never blocks public content behind a login wall.

**Why this priority**: The customer audience is public-first; the guest shell is the front door and the
funnel into everything else. It is the single most important deliverable and is demonstrable on its own.

**Independent Test**: Launch the customer app with no session; confirm the shell renders with its
primary navigation, the public destinations are reachable and usable without any sign-in prompt, and
switching between destinations preserves each one's scroll/position.

**Acceptance Scenarios**:

1. **Given** a guest with no session, **When** the app launches, **Then** the shell appears with its primary navigation and a public Home destination, with no forced sign-in.
2. **Given** a guest in the shell, **When** they switch between public destinations, **Then** the switch is immediate and each destination retains its prior state (position, entered input).
3. **Given** a guest on a public destination, **When** they navigate deeper (e.g. into a listing) and press back, **Then** they return within that destination's own history, not out of the app.
4. **Given** a guest, **When** they view any public destination, **Then** no card-style tiles or top-of-page metric cards are used (DOCTRINE-2).

---

### User Story 2 - Customer signs in exactly when needed, and continues (Priority: P1)

A guest taps an **authenticated-only** destination or action (e.g. Orders, Account, or "save"/"reorder").
The shell keeps that destination **visible** but recognizes it needs a session and presents **sign-in**
(and the option to **create an account**) at that moment — **deferred sign-in**. On success the person
is returned to **exactly** the destination/action they intended (**return-to-intent**), not dropped on a
generic home page. The customer can create an account or sign in through the platform's supported
credential routes, and can **sign out**, which returns them to the guest shell with public content
still available.

**Why this priority**: Converting a guest into an authenticated customer at the point of need is the
core account funnel; without it the private half of the app is unreachable. It builds directly on US1.

**Independent Test**: As a guest, tap an authenticated destination; complete sign-in (or sign-up); confirm
you land back on the intended destination. Sign out; confirm you return to the guest shell with public
content intact.

**Acceptance Scenarios**:

1. **Given** a guest, **When** they tap an authenticated-only destination, **Then** the shell presents sign-in / create-account rather than showing protected content or a dead end.
2. **Given** a guest who completes sign-in from a deferred prompt, **When** authentication succeeds, **Then** they are taken to the destination/action they originally intended (return-to-intent).
3. **Given** a guest, **When** they choose to create an account, **Then** they can do so through the platform's supported customer credential routes, converging on a single profile.
4. **Given** an authenticated customer, **When** they sign out, **Then** the session is cleared, they return to the guest shell, and public content remains usable.
5. **Given** an authenticated customer, **When** they open an authenticated destination, **Then** it is reachable without a further prompt for the life of the session.
6. **Given** a guest who cancels the sign-in prompt, **When** they dismiss it, **Then** they remain a guest on the previous public destination with nothing lost.

---

### User Story 3 - Shop operator works inside a fully-gated shell (Priority: P1)

A shop operator opens the **shop app**. The **only** public screen is **sign-in**; there is no guest
mode. After authenticating, they enter the operator **shell** with its primary navigation. Because the
shop app is **tablet-first**, the navigation is **adaptive** — a **navigation rail** on a large
tablet/landscape screen and a **bottom bar** on a phone — but the destinations and behavior are the
same. Every destination requires the session; there is no path to any operator content while signed out.
Signing out returns to the sign-in screen.

**Why this priority**: The shop audience is internal and login-first; the gated shell is the foundation
every future shop-mobile feature (catalog, orders) will live inside. It is independently demonstrable.

**Independent Test**: Launch the shop app with no session; confirm only sign-in is reachable. Sign in;
confirm the shell renders with adaptive navigation appropriate to the device size, and every destination
requires the session. Sign out; confirm return to sign-in.

**Acceptance Scenarios**:

1. **Given** the shop app with no session, **When** it launches, **Then** the only reachable screen is sign-in — no operator content is accessible.
2. **Given** an authenticated operator on a large tablet, **When** the shell renders, **Then** primary navigation appears as a side rail; **on a phone**, the same destinations appear as a bottom bar.
3. **Given** an authenticated operator, **When** they move between destinations, **Then** navigation is immediate and each destination preserves its state.
4. **Given** an authenticated operator, **When** they sign out, **Then** the session is cleared and they return to the sign-in screen with no operator content reachable.
5. **Given** a signed-out state, **When** any attempt is made to reach an operator destination, **Then** it is refused and routed to sign-in.

---

### User Story 4 - The session & navigation survive real-world conditions (Priority: P2)

Both apps behave reliably across the conditions real users hit: the app is **killed and relaunched**
(the session is restored without re-login if still valid; the person lands where they left off, at the
appropriate access level), the **session expires** mid-use (the app recovers silently where it can and
only prompts to re-authenticate when it genuinely cannot), the device **rotates / resizes / splits
screen** (navigation and current destination survive without loss), and **deep navigation history** per
destination is preserved and unwound predictably with the system back gesture.

**Why this priority**: "Robust and reliable" is an explicit requirement; a shell that loses state or
mis-handles expiry feels broken even if every screen is correct. It hardens US1–US3.

**Independent Test**: Sign in, navigate deep in one destination, kill and relaunch the app → session and
location restored. Force session expiry → the app recovers or prompts appropriately without losing the
user's place. Rotate/resize → no state loss.

**Acceptance Scenarios**:

1. **Given** a valid session, **When** the app is killed and relaunched, **Then** the person resumes authenticated without re-entering credentials, at the destination they left.
2. **Given** an expired/invalid session discovered during use, **When** the app detects it, **Then** it recovers silently if possible and only presents re-authentication when it cannot — never silently showing stale protected content.
3. **Given** any destination with its own history, **When** the device rotates/resizes/enters split view, **Then** the current destination and its history are preserved.
4. **Given** a customer guest whose session was never established, **When** the app relaunches, **Then** it returns to the guest shell (public), not a broken or blocked state.
5. **Given** a slow or unavailable network at launch, **When** session state cannot be confirmed immediately, **Then** the shell shows a graceful loading/degraded state rather than a crash or an indefinite blank.

---

### User Story 5 - Native-feeling, adaptive navigation on every device (Priority: P2)

The navigation feels **native and production-grade** on each platform (iOS and Android), adapts to
**screen size** (a bottom bar on compact widths; a navigation rail on expanded widths), respects safe
areas and system insets, offers the expected tactile feedback and motion, and keeps large touch targets.
The same destination model drives both form factors so nothing is lost when the layout changes.

**Why this priority**: Native feel and adaptivity are platform requirements (constitution Principle V);
they turn a working shell into one that feels like the reference apps.

**Independent Test**: Run each app across a phone and a tablet (and rotate); confirm the primary
navigation renders in the correct form (bar vs rail), destinations are identical, touch targets and safe
areas are respected, and transitions are smooth.

**Acceptance Scenarios**:

1. **Given** a compact-width device, **When** the shell renders, **Then** primary navigation is a bottom bar; **Given** an expanded-width device, **Then** it is a navigation rail — same destinations either way.
2. **Given** either app, **When** navigation renders, **Then** system insets/safe areas are respected and touch targets meet platform minimums.
3. **Given** a destination switch, **When** it animates, **Then** motion is smooth and consistent with the platform's conventions.

---

### Edge Cases

- **Deferred sign-in cancelled**: a guest who dismisses the sign-in prompt stays a guest exactly where they were; nothing they had entered is lost.
- **Session expires while on a protected destination**: the person is not shown stale protected data; they are recovered or routed to re-authenticate, and returned to intent afterward.
- **Sign-out from a protected destination**: the customer app returns to the guest shell (public), the shop app returns to sign-in; no protected content remains on screen.
- **Relaunch offline**: session validity cannot be confirmed — the shell shows a graceful state (guest/public for customer; a retryable sign-in gate for shop), never a crash or infinite spinner.
- **Rapid tab switching / double-tap a tab**: switching is debounced and a re-tap of the current tab returns to that destination's root (industry-standard behavior), without duplicate history.
- **Back gesture at a destination root**: behaves per platform convention (e.g. returns to the primary/home destination or backgrounds the app), never leaving the user on a blank screen.
- **Placeholder destinations**: destinations whose real content is a future slice (e.g. catalog browse, search results, orders) show a clear **"coming soon"** state, remain navigable, and do not error.
- **Deep-link / intent into a protected destination while signed out**: the shell holds the intent, authenticates, then delivers the destination (return-to-intent), rather than dropping the user at home.
- **Reduced-motion / accessibility settings**: navigation remains usable with system accessibility settings (reduced motion, larger text) without breaking layout.

## Requirements *(mandatory)*

### Functional Requirements

**Shell & primary navigation (both apps)**

- **FR-001**: Each mobile app MUST present a persistent **primary navigation shell** hosting the app's main destinations, so that content lives *inside* a stable frame rather than as disconnected screens.
- **FR-002**: Primary navigation MUST be **adaptive to screen size** — rendered as a **bottom navigation bar** on compact widths and a **navigation rail** on expanded widths — using the **same destination set** regardless of form factor.
- **FR-003**: Each primary destination MUST maintain its **own navigation history** (back stack), so moving between destinations and returning preserves where the user was in each.
- **FR-004**: Switching primary destinations MUST be **immediate** and MUST **preserve each destination's state** (scroll position, entered input) within a session of use.
- **FR-005**: Re-selecting the **currently active** destination MUST return it to its root (standard behavior); the system **back** gesture MUST unwind the active destination's history predictably.
- **FR-006**: The shell and its screens MUST follow **DOCTRINE-2** — no card-style layouts, no top-of-page metric/summary cards; use sectioned screens, lists, and detail rows.
- **FR-007**: Navigation MUST feel **native** per platform (iOS HIG / Android Material), respect **safe areas/system insets**, provide platform-appropriate motion and tactile feedback, and meet platform **touch-target** minimums (Principle V).

**Customer app — public + authenticated routing**

- **FR-008**: The customer app MUST be usable as a **guest** (no session): the shell, the public destinations, and public content MUST be reachable **without any forced sign-in**.
- **FR-009**: The customer app's primary destinations MUST be **Home, Search, Orders, and Account** — Home and Search **public**; Orders and Account **authenticated-only** (Account also holds settings and the sign-in / account-management entry).
- **FR-010**: Authenticated-only destinations MUST remain **visible** to a guest; selecting one (or a gated action) MUST trigger **deferred sign-in** — presenting sign-in / create-account at that moment rather than hiding the destination or dead-ending.
- **FR-011**: On successful authentication from a deferred prompt, the app MUST deliver the user to the **exact destination or action they intended** (**return-to-intent**), not a generic landing.
- **FR-012**: A guest MUST be able to **create an account** and **sign in** through the platform's supported **customer** credential routes, all converging on a single profile.
- **FR-013**: Cancelling a deferred sign-in MUST return the guest to their **previous public state** with nothing lost.

**Shop app — fully gated**

- **FR-014**: The shop app MUST expose **sign-in as its only public screen**; there MUST be **no guest mode** and **no** reachable operator content while signed out.
- **FR-015**: Every shop destination MUST require an **authenticated session**; any attempt to reach one while signed out MUST be refused and routed to sign-in.
- **FR-016**: The shop app MUST authenticate through the platform's **shop** credential route (passwordless email OTP), consistent with the shop audience's rules.
- **FR-017**: The shop app's primary navigation MUST be **adaptive** (a **rail** on tablet, a **bar** on phone) per FR-002, honoring the shop app's **tablet-first** posture.

**Authentication surface (both apps)**

- **FR-018**: Each app MUST present **authentication screens appropriate to its audience** (customer: sign-in + create-account across the customer routes; shop: passwordless email-OTP sign-in), integrated into the shell per that app's public/private rules.
- **FR-019**: **Sign-out** MUST clear the session and return the user to the correct entry state — the **guest shell** (customer) or the **sign-in screen** (shop) — leaving no protected content on screen.

**Session lifecycle & reliability (both apps)**

- **FR-020**: On launch, each app MUST **restore an existing valid session** without requiring re-login, and place the user at the appropriate access level (authenticated shell, or guest shell for a customer with no session).
- **FR-021**: When a session is found to be **expired/invalid** during use, the app MUST recover **silently where possible** and only prompt for re-authentication when it cannot — and MUST NOT display stale protected content in the meantime.
- **FR-022**: A signed-out user MUST **never** be able to view protected content; access control is enforced by the shell's routing, not merely by hiding a menu item.
- **FR-023**: Navigation state and the current destination MUST **survive configuration changes** (rotation, resize, split-screen) without loss.
- **FR-024**: When session state cannot be confirmed at launch (e.g. offline/slow), the shell MUST show a **graceful loading/degraded** state — never a crash, blank, or indefinite spinner.

**Scope of destinations**

- **FR-025**: Destinations whose real content is a **future slice** (e.g. catalog browse, search results, orders content) MUST render a clear **"coming soon"** placeholder that is navigable and non-erroring, so the shell is complete and demonstrable now.

**Reliability & responsiveness (measured in Success Criteria)**

- **FR-026**: The shell MUST launch quickly to an interactive state and switch destinations without perceptible lag, and MUST remain stable (no crashes) across the lifecycle and adaptivity scenarios above.

### Key Entities *(include if feature involves data)*

- **App Shell**: the persistent frame that hosts primary navigation and the active destination; one per app, aware of the current **session state** and screen size.
- **Primary Destination (tab)**: a top-level navigation target (e.g. Home, Search, Orders, Account) with a label, icon, an **access level** (public or authenticated), and its own navigation history.
- **Session State**: the app's current authentication status — *restoring*, *guest/signed-out*, *signed-in*, or *refused/expired* — which the shell routes on. (Backed by the existing per-app auth capability; not new persistent data.)
- **Navigation Intent**: a captured target destination/action a guest tried to reach before authenticating, used to return them there after sign-in (return-to-intent).
- **Access Level**: the classification of a route/destination as **public** or **authenticated-only**, which the shell enforces.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A guest can open the customer app and reach any **public** destination in **zero** sign-in steps (no forced auth wall), 100% of the time.
- **SC-002**: When a guest triggers deferred sign-in and authenticates, they land on the **intended** destination/action (return-to-intent) in **≥ 99%** of attempts.
- **SC-003**: A signed-out user can reach protected content **0%** of the time, across every path (tab, deep link/intent, relaunch) in both apps.
- **SC-004**: With a valid stored session, relaunching either app resumes the user **authenticated without re-login** and at their prior location in **100%** of cases.
- **SC-005**: Switching primary destinations feels **instantaneous** (no perceptible delay) and preserves each destination's state in **100%** of switches within a session.
- **SC-006**: The primary navigation renders in the **correct adaptive form** (bar on compact, rail on expanded) on phone and tablet, and after rotation, in **100%** of tested configurations, with no layout breakage.
- **SC-007**: The shop app exposes **exactly one** public screen (sign-in); an automated/manual audit finds **no** reachable operator destination while signed out.
- **SC-008**: Navigation state and the current destination survive configuration changes (rotate/resize/split) with **no** loss in **100%** of tested cases.
- **SC-009**: Both apps launch to an interactive shell quickly (target **≤ ~2 seconds** on a mid-range device) and record **zero** navigation/lifecycle crashes across the tested scenarios.
- **SC-010**: On session expiry mid-use, the app recovers silently or prompts re-auth **without ever displaying stale protected content**, in **100%** of tested expiries.
- **SC-011**: Both apps build and run on **Android and iOS**, and the shell + navigation behave to parity on both platforms.

## Assumptions

- **Mobile only**: Scope is the two KMP mobile apps — **customer-mobile** and **shop-mobile**. The three web surfaces already have their own shells and are **out of scope**.
- **Auth mechanics already exist**: The per-app authentication capability (customer: the three credential routes and token handling from 013; shop: passwordless email-OTP and single-token from 014) is **reused**, not rebuilt. This feature delivers the **shell, navigation, and public/private routing**, and surfaces/integrates the existing auth screens per each app's rules — refining those screens as needed to fit the shell.
- **This feature replaces the interim navigators**: the ad-hoc, single-destination navigators shipped in 013/014 are **superseded** by this production-grade shell.
- **Adaptive navigation** (confirmed): one destination model rendered as a **bottom bar on compact** and a **navigation rail on expanded** widths — for **both** apps; the customer app is phone-first (usually a bar), the shop app is tablet-first (usually a rail), but each adapts.
- **Deferred sign-in with return-to-intent** (confirmed) is the customer app's gating model; authenticated tabs stay visible.
- **Customer tabs** (confirmed): **Home · Search · Orders · Account** (Home/Search public; Orders/Account authenticated). Cart/checkout is **not** a tab in this slice.
- **Shop tabs (assumed, adjustable in planning)**: a small operator destination set — **Home/Overview, Catalog, Orders, Account/Settings** — with Catalog/Orders as **"coming soon"** placeholders until their feature slices (e.g. 016 catalog) land; Account holds identity, the manager area, and sign-out.
- **Session-expiry behavior (assumed)**: silent refresh where the platform's tokens allow it; a re-authentication prompt only on hard failure — never stale protected content.
- **Placeholder content**: destinations without a built feature show a **"coming soon"** state; building their real content is each feature's own future slice.
- **Technical direction for planning (not a spec requirement)**: the operator has indicated a modern, list-based navigation approach (Android **Navigation 3 / "nav3"**-style) with an adaptive navigation-suite shell; the `/plan` phase will choose the concrete mechanism within the platform's KMP + Compose standards.
- **Deep-linking**: in-app **navigation intent / return-to-intent** is in scope; a full external URL/universal-link scheme is **not** required here and may be a later enhancement.
- **Mobile telemetry** remains deferred (documented Principle VII deviation, consistent with 013/014); this feature does not add analytics/crash wiring.

## Dependencies

- **013-customer-mobile-foundation**: the customer `AuthDriver`, credential routes, and token handling this shell gates on.
- **014-shop-mobile-foundation**: the shop `AuthDriver` (email-OTP, single token), the tablet-first adaptive posture, and the manager gate; this shell hosts them.
- **Design system (Compose theme)**: the shared per-app Compose theme/tokens the shell and navigation are styled from.
- **Parity registers**: `docs/audiences/customer-capabilities.md` and `docs/audiences/shop-capabilities.md` MUST record the shell/navigation capability for each mobile surface.

## Out of Scope

- The **web** surfaces (customer-web, shop-web, back-office) — unchanged.
- **Actual feature content** behind the destinations — product/catalog browsing, search results, deals content, cart, checkout, order history/content, product detail. This slice ships the **shell + navigation + auth integration + placeholders**; each of those is its own future slice.
- **New authentication mechanics** — no new credential routes, pools, or token protocols; the existing per-app auth is reused.
- **External deep links / universal-app-links** beyond in-app return-to-intent.
- **Push-notification routing** into destinations (a notifications-slice concern).
- **Mobile telemetry/analytics** wiring (its own deferred slice).
