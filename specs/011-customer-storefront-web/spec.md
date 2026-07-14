# Feature Specification: Customer Storefront Web Foundation (Bootstrap)

**Feature Branch**: `011-customer-storefront-web`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "i want to boostrap the customer storefront web application now. it is fully written with using next js and shadcn ui. and how to integrate AWS amplify sdk to have authentication. and you can use any tanstask package as needed here aswell. you must use `pnpm dlx shadcn@latest init --preset b2BnwlLOK --base radix --template next --pointer` to create the next js project and you can use any tech that we use for back office or shop web app. but important thing is that this custoemr web app is SSR first because we need good SEO, and also all the product, cart, searching, order, payment related things must handle via core-api, becuase we need faster reliable highspeed serve. we can still use edge api for customer profile managment like features. first of all you need to do a deep research on how industry handle this kind of e commerce storefront with high speed, low latence, low bundle size, SEO frendly site and we need to follow those rules exactly. then boostrap the next js app with the ... command and then install aws amplify sdk gen2 react version here and integrate authentication and authorization here. 1) unlike back office and shop, customer is an indipendent entitiy who can self register to the platform. 2) we need to have email password, emmail otp, SSO with google sign in and sign up options. also custoemrs does not need to have sign in to browse throught the site and view products and do anything thing, only when ordering we need user sessionm, so we can as that in there. NOTE: in this spec let's boostrap the customer storefront web app with next js. then as the next spec i hope to create the KMP app for customer (android and ios)"

> The description carried substantial **technology direction** (the framework, the exact
> scaffolding command, the authentication SDK, the client-library latitude, the backend routing
> law, and the mandatory research pass). Constitution Principle I forbids technology in a
> specification, so those directives are recorded in
> [operator-directives.md](./operator-directives.md) as **binding plan-phase input**. This
> document stays WHAT/WHY only.

This slice **bootstraps the platform's fourth client surface and its first public one**: the
**customer storefront on the web**. Every surface built so far — the back-office console, the shop
console — sits **behind a login**, serves an **Effy employee**, and is deliberately invisible to the
outside world. This one inverts all three: it is **open to anyone**, it must be **found by search
engines**, and the person using it **has no account until they choose to make one**. It is the first
time the platform is judged by strangers, and the first time page speed is a business outcome rather
than an engineering nicety.

The deliverable is a **foundation, not a shop**. It proves the customer audience end to end: a
public, fast, indexable surface that a guest can browse with no account; a **self-registration**
capability the platform has never had; **three ways to prove who you are** that all land on one
identity; a login demand that is **deferred to the moment of ordering** rather than thrown at the
door; and the platform's own **customer record** as the authority on that customer's standing.

## Clarifications

### Session 2026-07-14

- Q: The storefront's commerce half (product, search, cart, order, payment) is directed to the
  hot path, but the hot-path service has **no cloud deployment** (no compute, no load balancer,
  nothing in the infrastructure that runs it) and the platform has **no product data of any kind** —
  not one catalog table exists. How much of that chain does this slice build? → A: **None of it.**
  The hot-path service **stays local-only for now** by operator decision; taking it live is
  **deferred to its own later slice**. This slice ships the **storefront shell only** — no catalog,
  no cart, no checkout, no payment, and no product data. The **routing law** (commerce → hot path;
  profile → cold path) is *established and documented* here and is binding on every later slice,
  but the commerce features that will obey it are not built here.

  **Consequence, accepted deliberately:** the speed and search-visibility criteria that motivated
  this slice **cannot be proven against product pages, because no product page exists.** They are
  therefore specified against **the pages this slice actually ships** (the storefront home, the
  browse placeholder, the sign-in and registration pages, the account pages) and against the
  **structural rules** that make later product pages fast and findable by construction — the page
  budget, the guest-page cacheability rule, the no-account-cost rule, the machine-readable page
  description, the sitemap and crawl directives. The catalog slice inherits those rules and proves
  them on real product pages. **Any success criterion below that is only *partially* provable in
  this slice says so in its own text.** This is a weaker sign-off than a full storefront, and it is
  chosen knowingly: it is better than measuring speed against placeholder content and calling it
  proven.

- Q: The constitution states that **there are no passwords anywhere on the platform** and that all
  four identity pools use passwordless one-time codes. The customer is to have **email + password**,
  a one-time code, and Google sign-in. How is this reconciled? → A: **Amend the constitution for the
  customer audience only.** The **customer** identity pool gains **three credential routes** —
  password, one-time code, and Google federated sign-in — and **open self-registration**. The
  **driver, shop and admin** pools are **untouched**: strictly passwordless one-time code, strictly
  admin-provisioned, no self-signup. The isolation rule between audiences and the no-auth-proxy rule
  are unaffected. Rationale: a self-registering member of the public has different expectations from
  a provisioned employee, and the security stance that makes sense for staff (no password to steal,
  no reset flow to attack) should not be traded away platform-wide to serve the public one. The
  amendment is authored at `/plan` — see **Constitution Impact** below.

- Q: A guest browses with no account, and is asked to sign in only when ordering. What happens to
  what they were doing when the demand finally comes? → A: **Nothing is lost.** The sign-in demand
  is raised **at the point of ordering, not at the door**, and after authenticating the shopper is
  returned to **exactly where they were**, with the work they had done intact. A shopper who is
  bounced to a login and dumped back at the home page has been made to start over, which is the
  failure this requirement exists to prevent. (This slice ships no cart, so the concrete thing
  preserved here is the shopper's **destination and intent**; the later cart slice extends the same
  guarantee to cart contents, which is why the guarantee is stated in terms of *context* and not
  merely *URL*.)

### Session 2026-07-15 — registration collects the customer's name (amends US2)

- Q: Registration asked only for an email (and, on the password route, a password). Should it collect
  the customer's **name**? → A: **Yes — a FIRST name and a LAST name, in two fields, collected AT
  REGISTRATION on both native routes, before the account is created.** Two parts, not one free-text
  name: a delivery label, an order confirmation and a support conversation all need the parts, and a
  single name cannot be split back into them reliably (ask anyone with two surnames, or one name).
  They map 1:1 onto the identity provider's standard given-name / family-name attributes, so they
  travel with the verified identity rather than needing a bespoke field. A grocery order has to be handed to *someone*; a store
  that knows a customer's email but not their name has to ask again at the worst possible moment —
  mid-checkout. Asking once, up front, costs one field and removes a later interruption.

  **Consequence**: `display_name` stops being an afterthought a customer may fill in later on the
  account page (FR-026) and becomes **part of the identity captured at sign-up** (FR-009a). It stays
  **nullable in the data model**, because the *federated* route (Google, parked) supplies whatever
  the provider gives us and may give us nothing — the platform must not invent a name it was not
  told. So: *required of the customer at registration on the two native routes; nullable in storage.*

- Q: The password route redirected the customer to sign-in after registering. Is that right? → A:
  **No — that was a defect against the existing US2 acceptance scenario 1**, which already said "an
  account is created, **and they are signed in**". Both native routes sign the customer in
  automatically once the emailed code is confirmed. Making someone type the password they just chose,
  ten seconds after choosing it, is a self-inflicted drop-off. Fixed in code, not by weakening the
  spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A stranger finds the store and browses it with no account (Priority: P1)

Someone who has never heard of Effy arrives — from a search engine, a shared link, or by typing the
address. They land on a page that is **already there**: the content is present the moment the page
arrives, not assembled afterwards while they watch a blank screen or a shimmer. They can move around
the storefront, look at what is on offer, and use it as a shopper would — **without an account,
without a prompt to sign in, and without being interrupted**. A search engine crawling the same page
sees the same content the shopper sees, and can understand and index it.

**Why this priority**: This is the entire reason the surface is SSR-first and the entire reason it
is public. A storefront that demands an account before it will show you anything cannot acquire a
customer, and one that search engines cannot read cannot be found in the first place. Everything
else in this slice is in service of this. It is independently valuable: a fast, indexable, browsable
public surface is worth shipping even with nothing behind it yet.

**Independent Test**: Visit the storefront as a completely fresh, unauthenticated visitor with no
stored session. Confirm every public page renders its content fully-formed on arrival, that no page
demands an account, and that nothing about the experience degrades for being signed out. Confirm the
content of each public page is present in what a crawler receives (not only in what a browser
assembles), that each page carries an accurate machine-readable description of itself, and that the
storefront publishes a machine-readable index of its pages and correct crawl directives. Measure the
loading experience and the responsiveness of each page against the stated budgets.

**Acceptance Scenarios**:

1. **Given** a visitor with no account and no prior session, **When** they open any public page of
   the storefront, **Then** the page's content is present on arrival and is fully usable — with no
   sign-in wall, no account prompt, and no functional degradation attributable to being signed out.
2. **Given** a search engine crawler that does not execute client-side code, **When** it fetches any
   public page, **Then** it receives that page's actual content — the same substance a shopper sees
   — and not an empty shell to be filled in later.
3. **Given** any public page, **When** it is inspected, **Then** it carries an accurate,
   page-specific machine-readable description of itself (title, summary, canonical address, and
   social preview), and the storefront as a whole publishes a machine-readable index of its public
   pages plus explicit directives for what may and may not be crawled.
4. **Given** a visitor on a mid-range mobile device over a typical mobile connection, **When** they
   open a public page, **Then** the loading experience, interaction responsiveness, and visual
   stability all meet the budgets in Success Criteria, and the amount of code shipped to their
   device stays within the stated budget.
5. **Given** a guest browsing the storefront, **When** they move between public pages, **Then**
   navigation is immediate and no page re-demands work already done.
6. **Given** a guest, **When** they browse, **Then** the cost of the account system is not imposed
   on them — the machinery that exists to authenticate people is not loaded onto the device of
   someone who is not signing in.

---

### User Story 2 - A shopper creates their own account, three different ways (Priority: P2)

A shopper decides to join. **They do this themselves — nobody provisions them, invites them, or
approves them**; this is the first audience on the platform that can walk up and create an account,
and the storefront is the first surface that has ever had to offer it. They can choose the route
that suits them: **set an email and a password**; or **receive a one-time code by email and skip the
password entirely**; or **use their Google account and type nothing at all**. Whichever route they
pick, they end up as **one customer** with **one identity** — and a shopper who registers one way
and later returns by another way is **the same person to the platform, not a duplicate**. They can
sign in again later, stay signed in across visits, and sign out cleanly.

**Why this priority**: Self-registration is a capability the platform has never had and the ordering
flow cannot exist without it. It is second only to public browsing because a store must be browsable
before an account has any point. It is independently testable and demonstrable on its own.

**Independent Test**: From a fresh browser, register a brand-new customer by each of the three
routes in turn and confirm each produces a working, signed-in session. Then confirm the identities
converge: register by one route and return by another using the same email address, and confirm the
platform recognises the same single customer rather than creating a second one. Confirm the session
survives a reload, that sign-out clears it, and that every failure along the way is explained
clearly enough to act on.

**Acceptance Scenarios**:

1. **Given** a visitor with no account, **When** they register with their **first name**, **last
   name**, an email address, a password, and a confirmation of that password, **Then** their identity
   is verified, an account is created **carrying both name parts**, and they are **signed in
   automatically** — they are never asked to re-enter the password they just chose.
1a. **Given** the password registration form, **When** the password and its confirmation do not match,
   **Then** the customer is told so **before** the form is submitted, and no account is attempted.
2. **Given** a visitor with no account, **When** they register with their **first name**, **last
   name** and an email address only, **Then** a one-time code is sent to that address and, on
   submitting it correctly, an account is created **carrying both name parts** and they are **signed
   in automatically** — with no password ever set, and with **one** code, not two.
3. **Given** a visitor with no account, **When** they choose to register with their Google account,
   **Then** they are taken to Google, and on returning successfully an account is created and they
   are signed in — with no password and no code.
4. **Given** a shopper who already registered by one route, **When** they later return and sign in
   by a **different** route with the **same email address**, **Then** the platform recognises them
   as **the same single customer** and does not create a duplicate account.
5. **Given** a registered shopper, **When** they sign in on a later visit, **Then** their session
   persists across page reloads until it legitimately expires, and signing out clears it completely.
6. **Given** any failure — wrong password, wrong or expired code, an abandoned Google flow, an email
   already registered, or a rejected weak password — **When** it occurs, **Then** the shopper is
   told what happened in terms they can act on, and is never left stranded with no way forward.
7. **Given** a shopper who set a password and later forgets it, **When** they ask to recover their
   account, **Then** they can regain access by proving control of their email address.
8. **Given** the credential system, **When** it is exercised against the other three audiences,
   **Then** the driver, shop and admin audiences remain **strictly passwordless and strictly closed
   to self-registration** — this slice grants the new credential routes and open sign-up to the
   **customer audience only**.

---

### User Story 3 - The store asks who you are only when it matters (Priority: P3)

A guest browses freely and reaches the point of **ordering**. Only here — at the transaction, not at
the entrance — does the store need to know who they are, and only here does it ask. The shopper signs
in or registers **without losing their place**: when they come back through the door, they are
**exactly where they left off, with what they were doing intact**, and can carry straight on. They
are never made to start over as the price of authenticating.

**Why this priority**: This is the rule that makes guest-first browsing real rather than nominal. A
store that lets you browse and then throws away your context at the login screen has simply moved
the sign-in wall to a more expensive place. It is stated and enforced now, at the foundation,
because it is far harder to retrofit once ordering is built on top of it.

**Independent Test**: As a guest, navigate deep into the storefront, attempt an action that
genuinely requires an identity, confirm the sign-in demand is raised **at that action and not
before**, complete authentication by each of the three routes, and confirm the shopper is returned
to the exact place they were, with their context intact, and the action they intended proceeds.

**Acceptance Scenarios**:

1. **Given** a guest browsing the storefront, **When** they use any part of it that does not require
   an identity, **Then** they are **never** asked to sign in.
2. **Given** a guest, **When** they attempt an action that genuinely requires an identity (ordering),
   **Then** — and only then — they are asked to sign in or register, and the request explains why it
   is being made now.
3. **Given** a guest who is asked to authenticate at that point, **When** they complete sign-in or
   registration by **any** of the three routes, **Then** they are returned to exactly where they
   were, with their context preserved, and the action they originally intended proceeds without
   being restarted.
4. **Given** a guest who **declines** to sign in at that point, **When** they dismiss the request,
   **Then** they are returned to browsing with their context intact and nothing lost — declining to
   authenticate is not punished.
5. **Given** an unauthenticated visitor, **When** they navigate directly to an account-only area
   (by deep link, bookmark, or browser history), **Then** they are asked to authenticate and, on
   success, delivered to the destination they originally asked for.

---

### User Story 4 - A signed-in shopper has a real record, and their credential works nowhere else (Priority: P4)

Once a shopper has an identity, the platform keeps **its own record of them** — created the first
time they appear and thereafter the authority on their standing with Effy. The storefront reads that
record to show the shopper their own account details, and the shopper can maintain them. Their
standing is **the platform's to decide, never the credential's to assert**: a customer the platform
has barred does not become un-barred by holding a valid credential. And their credential is **theirs
alone and works nowhere else** — a customer credential presented to any employee-facing part of the
platform is **structurally refused**, and an employee credential is refused by the customer's.

**Why this priority**: It closes the audience end to end and lays the record every later customer
feature depends on — an order needs a customer to belong to. It also proves the platform's four-way
isolation rule holds for the audience where it matters most, the one anybody in the world can join.
It comes last because it is only reachable once registration works.

**Independent Test**: Sign in as a newly registered customer and confirm the storefront displays the
account details the platform holds for them, that a record was created on first appearance and
reused (not duplicated) on subsequent visits, and that they can maintain their own details. Then
present a customer credential to an employee-facing service and confirm structural refusal, and
present an employee credential to the customer's and confirm the same. Finally, mark a customer as
barred in the platform's own record and confirm they are refused despite holding a perfectly valid
credential.

**Acceptance Scenarios**:

1. **Given** a customer signing in for the very first time, **When** their session is established,
   **Then** the platform creates its own customer record for them, keyed to their verified identity.
2. **Given** a returning customer, **When** they sign in again, **Then** the **existing** record is
   found and reused — repeated sign-ins never create a second record for the same person.
3. **Given** a signed-in customer, **When** they open their account area, **Then** the storefront
   displays the details held in the platform's own record — not merely what their credential happens
   to assert — and they can update the details that are theirs to change (**their first and last
   name**; never their email, which is an identity operation, and never their standing).
4. **Given** a customer whose record the platform has marked as **barred**, **When** they present a
   completely valid credential, **Then** they are refused — the platform's record decides, and a
   valid credential never overrides it.
5. **Given** a valid **customer** credential, **When** it is presented to a service scoped to the
   back-office or shop audience, **Then** it is refused **before any handler logic runs** — it is
   structurally unusable there, not merely unauthorised.
6. **Given** a valid **back-office** or **shop** credential, **When** it is presented to a service
   scoped to the customer audience, **Then** it is likewise refused.

---

### Edge Cases

- **A crawler and a shopper disagree.** What if the page a crawler receives differs in substance from
  the page a shopper sees? This must not happen: the two must show the same content. Deliberately
  serving different content to crawlers is prohibited.
- **The Google account has no email, or an unverified one.** What happens when a federated identity
  arrives without a usable, verified email address — the very key used to converge the three routes
  onto one customer?
- **The same email arrives by two routes at once.** Two registrations for one address, racing.
  Exactly one customer must result. *(Two distinct races, and both are covered: the **database** race by
  the idempotent upsert, and the **identity-provider** race by the linking trigger. The E2E exercises
  both concurrently.)*
- **An email already registered with a password now arrives via Google.** They must converge on the
  existing customer — but converging on the basis of an *unverified* email is an account-takeover
  vector, and this must not be the mechanism by which it happens.
- **The one-time code is requested repeatedly**, or the password is guessed repeatedly. What
  throttles abuse of an endpoint that is, by design, open to the entire internet? This surface has no
  admin-provisioning gate to hide behind — it is the first that is genuinely exposed.
- **The session expires mid-order.** The shopper is authenticated when they begin and expired by the
  time they act. **⏭ Deferred to the checkout slice, deliberately** — this slice ships **no ordering
  flow** (`/checkout` is a placeholder), so there is no "mid-order" to expire in. Building a defence for
  a flow that does not exist would be untestable theatre. Recorded here so the checkout slice inherits
  it rather than rediscovering it.
- **The shopper signs out in one tab while ordering in another.** **⏭ Deferred to the checkout slice**,
  for the same reason.
- **The account system is unreachable** when someone tries to sign in. Guests must still be able to
  browse — an authentication outage must not take the storefront down for people who were not going
  to sign in anyway.
- **A backend is unreachable or slow to wake.** The page must degrade to something clear and
  recoverable rather than breaking, and a failure in a personalised region of the page must not take
  the public content of the page down with it.
- **The shopper has code execution disabled or blocked.** How much of a public page still works?
- **A page is deep-linked, shared, or restored from history** — including the pages a shopper reaches
  mid-authentication.

## Requirements *(mandatory)*

### Functional Requirements

**Public surface, speed and findability**

- **FR-001**: The storefront MUST be a **public surface**: every non-account page MUST be fully
  usable by a visitor with no account and no session, with no sign-in wall and no degradation
  attributable to being signed out.
- **FR-002**: Public pages MUST arrive with their content **already rendered** — present in what a
  non-executing client (such as a crawler) receives, not assembled on the device afterwards.
- **FR-003**: Every public page MUST carry an accurate, page-specific machine-readable description of
  itself: a title, a summary, a single canonical address, and a social-sharing preview.
- **FR-004**: The storefront MUST publish a machine-readable index of its public pages and explicit
  directives stating what may and may not be crawled.
- **FR-005**: The storefront MUST meet a defined budget for loading experience, interaction
  responsiveness, visual stability, and the volume of code shipped to the device. The budgets MUST be
  **enforced automatically** — a change that breaches one MUST fail the build rather than be
  discovered in production.
- **FR-006**: The machinery that exists to authenticate people MUST NOT be loaded onto the device of
  a guest who is not authenticating. A visitor who never signs in MUST NOT pay for the account
  system.
- **FR-007**: Public pages MUST be **cacheable**, and personalised content MUST NOT make them
  uncacheable. Where a page mixes public and personalised regions, the public region's cacheability
  MUST be preserved.
- **FR-008**: The storefront MUST NOT serve different content to crawlers than to shoppers.

**Identity: self-registration and three credential routes**

- **FR-009**: A member of the public MUST be able to **register themselves** as a customer, with no
  invitation, provisioning, or approval step. The customer is the platform's first and only
  self-registering audience.
- **FR-009a**: Registration MUST collect the customer's **first name and last name**, as **two
  separate fields**, on both native routes (password and one-time code), **before the account is
  created**, and the created account MUST carry both. A grocery order is handed to a person; a store
  that must ask "who are you?" mid-checkout has asked too late.
  *(Two parts, not one free-text name: the parts are what a delivery label and an order confirmation
  need, and a single name cannot be reliably split back into them. The **federated** route supplies
  whatever the provider asserts and may assert neither — the platform MUST NOT invent a name it was
  not given, so both parts remain optional in storage.)*
- **FR-009b**: On completing registration by **either** native route, the customer MUST be **signed in
  automatically**. They MUST NOT be asked to re-enter a password they chose seconds earlier, nor to
  request a second code.
- **FR-010**: Registration and sign-in MUST be offered by **three routes**: (a) email and password,
  (b) a one-time code sent to an email address, with no password set, and (c) Google federated
  sign-in.
- **FR-011**: All three routes MUST converge on **one customer identity per person**. A person who
  registers by one route and returns by another MUST be recognised as the same customer, and MUST
  NOT be duplicated.
- **FR-012**: Convergence MUST be safe: two identities MUST NOT be linked on the basis of an
  **unverified** email address, as this would be an account-takeover path.
- **FR-013**: A registered customer MUST be able to sign in on a later visit, MUST have their session
  persist across page reloads until it legitimately expires, and MUST be able to sign out completely.
- **FR-014**: A customer who set a password MUST be able to **recover their account** by proving
  control of their email address.
- **FR-015**: Every authentication failure — wrong password, wrong or expired code, abandoned
  federated flow, already-registered email, rejected password — MUST be reported to the shopper in
  terms they can act on, and MUST never leave them stranded with no way forward.
- **FR-016**: Authentication and registration endpoints MUST be protected against abuse (repeated
  code requests, repeated password attempts, automated registration), as this is the platform's first
  surface genuinely exposed to the public internet.
- **FR-017**: The new credential routes and open self-registration MUST apply to the **customer
  audience only**. The **driver, shop and admin** audiences MUST remain strictly passwordless
  (one-time code) and strictly admin-provisioned, with no self-registration.

**The deferred sign-in demand**

- **FR-018**: The storefront MUST NOT ask a guest to sign in for anything that does not genuinely
  require an identity.
- **FR-019**: The sign-in demand MUST be raised **at the point of ordering** — the first action that
  genuinely requires an identity — and MUST explain why it is being asked at that moment.
- **FR-020**: On completing authentication from a deferred demand, the shopper MUST be returned to
  **exactly where they were**, with their context intact, and the action they originally intended
  MUST proceed without being restarted.
- **FR-021**: A shopper who **declines** the deferred sign-in demand MUST be returned to browsing
  with their context intact and nothing lost.
- **FR-022**: An unauthenticated visitor reaching an account-only area directly (deep link, bookmark,
  history) MUST be asked to authenticate and, on success, delivered to their originally requested
  destination.

**The customer record and isolation**

- **FR-023**: The platform MUST keep **its own record** of each customer, created the first time that
  customer appears and keyed to their verified identity.
- **FR-024**: Record creation MUST be **idempotent** — repeated sign-ins by the same customer MUST
  reuse the existing record and MUST NOT create a duplicate, including under concurrent sign-ins.
- **FR-025**: A customer's **standing with the platform** MUST be **platform-owned** and MUST be the
  authority on the access decision. A valid credential MUST NOT override it: a barred customer is
  refused regardless of how impeccable their credential is.
- **FR-026**: The storefront MUST read the customer's details from the platform's own record — not
  from what the credential asserts — and the customer MUST be able to maintain the details that are
  theirs to change.
- **FR-027**: A **customer** credential MUST be structurally refused by every service scoped to
  another audience, and every other audience's credential MUST be structurally refused by services
  scoped to the customer — refused **before any handler logic runs**, not merely unauthorised.

**The routing law (established here, binding on later slices)**

- **FR-028**: The platform MUST record, as a binding rule, that **commerce traffic — product,
  catalog, search, cart, order and payment — is served by the low-latency hot path**, and that
  customer **profile and account-management** traffic may be served by the cost-optimised cold path.
  No later slice may place a commerce feature on the cold path without a justified, recorded
  exception.
- **FR-029**: The storefront MUST treat the address of each backend as **configuration, never a
  literal**, so that the hot path can be moved from a developer's machine to a deployed environment
  with **no code change**.
- **FR-030**: The storefront MUST degrade **gracefully and recoverably** when a backend is
  unreachable or slow to wake, and a failure in a personalised region MUST NOT take down the public
  content of the page around it.

**Parity**

- **FR-031**: The platform MUST record the customer audience's **capability baseline** as a single
  register that **both** customer surfaces — this web storefront and the forthcoming customer mobile
  app — are held to, with each capability marked delivered on web and **outstanding on mobile**, so
  that the mobile gap is explicit rather than silent.

### Key Entities

- **Customer**: A self-registered member of the public who shops with Effy. The platform's own record
  of them — distinct from their credential — holding a stable identity, the verified email address
  that identifies them, a display name, and a **platform-owned standing** (active or barred) that is
  authoritative for access. Created on first appearance; never duplicated. This is the platform's
  first record of a person who is **not** an Effy employee.
- **Credential route**: The means by which a customer proves who they are — a password, a one-time
  emailed code, or a Google account. **Multiple routes, one customer**: a route is how you get in,
  not who you are.
- **Deferred intent**: What a guest was trying to do when the store finally needed to know who they
  are. Held across authentication and resumed afterwards, so that signing in never costs the shopper
  their progress.

## Success Criteria *(mandatory)*

> **Scope caveat (see Clarifications):** this slice ships **no product data**. Criteria concerning
> speed and findability are therefore measured against **the pages this slice ships** — the home
> page, the browse placeholder, the sign-in and registration pages, and the account pages. Criteria
> marked **[partial]** are structurally established here and **fully proven in the catalog slice**,
> against real product pages. This is stated plainly rather than papered over.

### Measurable Outcomes

- **SC-001**: A visitor with **no account** can reach and use **100%** of the storefront's public
  pages, and is asked to sign in **zero** times while doing so.
- **SC-002**: On a mid-range mobile device over a typical mobile connection, the shipped public pages
  meet: **largest contentful paint under 2.5 s**, **interaction to next paint under 200 ms**, and
  **cumulative layout shift under 0.1** — at the 75th percentile. *[partial — re-proven on product
  pages in the catalog slice]*
- **SC-003**: The code shipped to a **guest's** device on first load of a public page stays **within
  the budget fixed by the research pass — ≤ 160 KB compressed** — and the account system contributes
  **zero** to it for a guest who does not authenticate. The budget is enforced automatically: a
  breach **fails the build**.
  > **Budget corrected during implementation (2026-07-14).** Research originally set 120 KB on a
  > mistaken estimate of the framework baseline. Measured, the Next 16 + React 19 floor is ~136 KB
  > with *zero* application code, making 120 KB unreachable by construction. The enforced budget is
  > **160 KB**, against a measured **148.5 KB**. This still bars the auth SDK from the guest path —
  > the constraint the criterion exists to protect. Full audit trail in research **D9**.
- **SC-004**: **100%** of public pages deliver their content to a client that executes **no**
  client-side code — verified by fetching each page's raw response and finding the content there.
  *[partial — the catalog slice proves this on product pages]*
- **SC-005**: **100%** of public pages carry a complete, accurate, page-specific machine-readable
  description (title, summary, canonical address, social preview), and the storefront publishes a
  valid page index and valid crawl directives.
- **SC-006**: A new customer can **self-register and be signed in** by **each** available route — with
  **no** invitation, provisioning, or approval, and each route completes in **under 2 minutes**. On both
  native routes the account is created **carrying the first and last name the customer gave**, and the
  customer is **signed in automatically** — **zero** instances of being returned to a sign-in form to re-enter a
  password they just set.
- **SC-007**: A person who registers by one route and returns by another with the **same verified
  email** is recognised as **one customer**: the platform holds **exactly one** record for them, and
  **zero** duplicates — including when both routes are exercised **concurrently**.
- **SC-008**: A guest who is asked to sign in at the point of ordering and completes it is returned
  to **exactly** the place they were, with their context intact and their intended action proceeding
  — in **100%** of cases, by **every** one of the three routes, with **zero** instances of being
  dumped at the home page or made to start over.
- **SC-009**: A guest who **declines** the sign-in demand returns to browsing having lost **nothing**.
- **SC-010**: Repeated sign-ins by the same customer produce **exactly one** platform record —
  verified across at least 10 consecutive sign-ins and under concurrent sign-in.
- **SC-011**: A customer marked **barred** in the platform's own record is **refused**, in **100%** of
  attempts, while holding a **completely valid** credential.
- **SC-012**: A **customer** credential is refused by **every** employee-facing service, and **every**
  employee credential is refused by the customer-facing service — refused **before any handler logic
  runs**, in **100%** of attempts, with **zero** exceptions.
- **SC-013**: An **authentication outage** leaves **100%** of public browsing working — a guest who
  was never going to sign in is unaffected by the account system being down.
- **SC-014**: Every public page renders correctly in **both light and dark** appearance and at every
  supported viewport, using **only** the platform's shared design tokens — **zero** surface-local
  brand colours.
- **SC-015**: The **capability parity register** for the customer audience exists, lists every
  capability this slice delivers, and marks the mobile column **outstanding** — giving the next slice
  (the customer mobile app) a definition of done it can be held to.

## Constitution Impact

⚠ **This slice cannot be planned without amending the constitution.** Recorded here so it is
confronted at `/plan` rather than discovered in code.

**Principle IV (Auth Isolation)** currently states that **all four pools use passwordless EMAIL_OTP**
and that **"there are no passwords anywhere on the platform."** FR-010's password route and its
Google federated route contradict that text directly, and Governance requires a version bump with a
recorded rationale rather than a silent workaround.

The amendment to be authored at `/plan` (expected **v1.7.0**, MINOR — it expands what a pool may do
without invalidating any existing plan):

- The **customer** pool MAY offer **password**, **one-time code**, and **federated (Google)**
  sign-in, and is **open to self-registration**.
- The **driver, shop and admin** pools remain **strictly passwordless one-time code** and **strictly
  admin-provisioned**. The claim "there are no passwords anywhere on the platform" narrows to "there
  are no passwords on the platform's **internal** audiences."
- **Unchanged**: four-pool isolation, per-pool validation, the pinned issuer, the no-auth-proxy rule,
  the cross-pool rejection rule, and the claim-as-origin / record-as-authority distinction (which
  FR-025 relies on).

## Assumptions

- **Guest-first is the default, not an exception.** The storefront is assumed public unless a page
  genuinely needs an identity; account-only areas are the minority and are enumerated.
- **Email is the identity key** that converges the three credential routes onto one customer — and it
  must be **verified** before it converges anything (FR-012).
- **The customer audience's identity pool already exists** (created in 001) and has never had a
  client. This slice is its first, and it will need amending to carry the new credential routes and
  the federated provider.
- **Google is the only federated provider** in this slice. Others (Apple, Facebook) are out of scope
  and are not designed for, though the pattern should not preclude them.
- **The customer record lives in the platform's operational data area**, alongside the shop records —
  not the back-office area, whose purpose is staff accounts and audit.
- **The hot path stays local-only** for this slice, by operator decision (2026-07-14). The storefront
  is developed against a locally running hot path and the **live** cold path, exactly as the existing
  consoles are developed against live dev backends. Taking the hot path live is **its own later
  slice**, and FR-029 exists so that slice requires no code change here.
- **No commerce data model is designed here.** Catalog, cart, order and payment entities are **out of
  scope** and are deliberately not pre-designed, so the slice that builds them is not boxed in by
  guesses made now.
- **The performance budgets are set by the research pass**, not invented in this spec. SC-002's
  thresholds are the industry-standard "good" thresholds and are assumed to stand; SC-003's code
  budget is to be fixed by research (see [operator-directives.md](./operator-directives.md) **OD6**) and
  then enforced.
- **Consent-respecting analytics and no PII in telemetry** (constitution Principle VII) apply here as
  everywhere — and matter more here, because this is the first surface used by members of the public
  rather than employees.

## Dependencies

- The **customer identity pool** (001) — exists, unused, and must be amended for the new credential
  routes and the federated provider.
- A **Google OAuth client** — an **out-of-code, operator-owned** dependency, exactly as the domain
  registrar is (010). It must be registered and its credentials supplied before federated sign-in can
  work.
- The **shared HTTP gateway** and its **customer authorizer** (004) — exist; this slice is the
  customer authorizer's first real client.
- The **branded domain and email sending** (010) — the storefront's public address and the
  deliverability of one-time codes and account emails both rest on it. **010's operator run is still
  open**, and this slice's one-time-code route inherits that dependency.
- The **shared packages** (`design-system`, `shared-types`, `api-client`, `web-kit`) — exist, but were
  built for **authenticated SPA consoles**; their fitness for a server-rendered public surface must be
  assessed, not assumed (see [operator-directives.md](./operator-directives.md) **OD5**).

## Out of Scope

Explicitly **not** in this slice, each deferred to its own future slice:

- **The catalog** — products, categories, search, and any product data whatsoever.
- **The cart**, checkout, orders, and payment.
- **Taking the hot path live** — its cloud deployment, load balancing, scaling and domain.
- **The customer mobile app** — the operator's stated next slice; this slice defines the parity
  register it will be held to.
- **Federated providers other than Google.**
- Delivery, fulfilment, driver-facing behaviour, and promotions.
