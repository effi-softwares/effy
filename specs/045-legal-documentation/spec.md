# Feature Specification: Customer Legal & Informational Documentation (Web + Mobile, Store-Ready)

**Feature Branch**: `045-legal-documentation`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "understand the platform very well and check customer web app and customer mobile app and identify all the documentation, legal documentation like privacy policy documentations, terms and conditions and all the related things, identify what we have here. I do not think we have correct content in all of these files. also you have to go internet, do a deep research on what we need to have in our mobile app to put them in Apple App Store and Google Play Store. Identify all of them and create pages/components/documents about them, write correct legal documents and other documents in a legal way, and each file needs to link in correct places. Author all the documents needed — I will verify them by a lawyer later."

---

## Context: what this changes and why

The customer surfaces already carry the *skeleton* of a legal layer, built by earlier slices as a
store-compliance placeholder, not as real content:

- **customer-web** has route shells at `/legal/privacy` and `/legal/terms` (each renders a single
  "This document is being prepared" paragraph), an empty `/legal/[type]/versions` dynamic route, and a
  built public `/delete-account` page. Consent text on sign-up already names *Terms of Service* and
  *Privacy Policy*; the account page and delete-account page link to `/legal/privacy` and `/legal/terms`.
- **customer-mobile** has a *Privacy & data* screen under Account with rows for "Privacy policy",
  "Terms of service" and "Delete account" — but **both the Privacy and Terms rows currently open the same
  placeholder screen** (a wiring defect), and there is no rendered document behind either.

Feature 034 deliberately shipped placeholder prose and recorded, in
`specs/034-customer-account-center/SUBMISSION-BLOCKERS.md`, that **the two mobile apps must not be
submitted** until real privacy and terms content exists, on the reasoning that generated legal text
would put an unverified claim in front of a store reviewer and a customer at once (FR-052a, SC-010).

This slice **supersedes that hold** on explicit operator instruction: it authors the full set of
legal and informational documents as reviewed-pending **drafts** (the operator will have a lawyer
verify them), builds the pages/components/screens that render them on both customer surfaces, wires
every document into the places a customer and a store reviewer expect to find it, and produces the
store-submission collateral (Apple App Privacy details, Google Data safety mapping, reviewer notes,
policy/deletion URLs, EULA posture) so the two mobile apps can actually be submitted.

**Scope boundary — this is the whole legal-documentation feature in one slice.** A prior plan split
this into "build the system" and "author the prose" as two specs; the operator's instruction to author
the documents *now* consolidates them here. Where a document makes a factual claim about the platform
(what data is collected, what is retained, how deletion works), that claim MUST be true of the system
as built (the SC-010 discipline), or the document MUST describe the current behaviour rather than an
aspirational one.

**This slice is customer-facing documentation and its wiring. It is NOT:** new data collection, new
account/deletion mechanics, the background erasure worker (a tracked dependency — see Dependencies),
or changes to what the platform actually does with data. If a required document would have to state
something untrue to be store-acceptable, that gap is surfaced as a dependency, not papered over.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A customer can read accurate, complete legal documents before and after they buy (Priority: P1)

A shopper — guest or signed-in, on web or in either mobile app — can find and read Effy's Privacy
Policy, Terms of Service, and the other customer-facing legal documents, each written in plain,
lawful language, each carrying an effective date, each accurately describing what Effy actually does
with their information and money.

**Why this priority**: This is the substance of the feature and the thing a lawyer will review. Every
other story (store submission, in-app links) is worthless if the documents themselves are wrong,
missing, or contradict the built system. It is also a legal obligation independent of the app stores:
an Australian business that collects personal information must publish an accurate, accessible privacy
policy.

**Independent Test**: Open each document on web and in mobile; confirm real, complete prose (not a
placeholder), an effective/last-updated date, and that every factual statement (data collected,
sub-processors, retention list, deletion behaviour, delivery/refund rules) matches the platform as
built. Deliverable value: a reviewable, publishable legal corpus.

**Acceptance Scenarios**:

1. **Given** a guest on the web storefront, **When** they open the Privacy Policy from the footer,
   **Then** they see a complete policy stating what personal information Effy collects, why, who it is
   shared with, how long it is kept, how it is protected, and how to access, correct, delete or
   complain — with an effective date.
2. **Given** a signed-in customer in the mobile app, **When** they open Account → Privacy & data →
   Terms of service, **Then** they see the actual Terms (not the Privacy screen, not a placeholder),
   covering ordering, pricing, substitutions, delivery, cancellations and refunds, acceptable use,
   liability and governing law.
3. **Given** any legal document open on both web and mobile, **When** the same document is compared
   across surfaces, **Then** the substantive content is identical (single source of truth, no drift).
4. **Given** the Privacy Policy's retained-data section, **When** it is checked against the platform's
   actual retention behaviour, **Then** every retained category it names (e.g. completed orders,
   payment records, fraud/security signals) is a category the system actually retains, and the stated
   deletion behaviour matches what the system actually does today.

---

### User Story 2 - The mobile apps meet Apple App Store and Google Play submission requirements (Priority: P1)

The operator can submit customer-mobile (iOS and Android) to the App Store and Google Play without a
rejection caused by a missing or non-compliant legal document, privacy disclosure, account-deletion
path, or store metadata.

**Why this priority**: The user's explicit goal is store submission. A single missing privacy-policy
link, an inconsistent Data safety answer, or an unreachable deletion URL blocks the entire release,
and these are the most-reported rejection reasons in this area.

**Independent Test**: Walk each store's published requirements against the feature's deliverables —
in-app privacy policy link, public non-geofenced privacy policy URL, in-app account deletion, public
deletion URL matching the privacy policy, App Privacy details mapping, Data safety mapping, EULA
posture, reviewer notes — and confirm each is satisfied and self-consistent.

**Acceptance Scenarios**:

1. **Given** the App Store 5.1.1(i) requirement, **When** a reviewer looks for the privacy policy,
   **Then** it is linked within the app "in an easily accessible manner" and reachable at a public,
   publicly accessible URL, and it identifies the data collected, its uses, retention/deletion, and how
   to revoke consent or request deletion.
2. **Given** the App Store 5.1.1(v) requirement, **When** a reviewer creates and then deletes an
   account from within the app, **Then** deletion can be *initiated in-app* and completes (with the
   web page available to finish/parallel it), and the flow is not merely a deactivation.
3. **Given** Google Play's User Data policy, **When** the Data safety form is filled, **Then** an
   in-app deletion path AND a public web deletion URL both exist, the deletion URL equals the URL cited
   in the privacy policy, the page is functional, prominently features deletion, and names the app/
   developer.
4. **Given** Apple's App Privacy details and Google's Data safety section, **When** the operator fills
   each console form, **Then** a documented data-type mapping exists that lists every data type the app
   and its third-party SDKs collect, how each is used, and whether it is linked to identity or used for
   tracking — and the two mappings and the privacy policy agree with one another.
5. **Given** the account-deletion reviewer trap, **When** submission notes are prepared, **Then** they
   instruct the reviewer to register a throwaway account before testing deletion (rather than deleting
   the demo account), with no special-cased account in code.
6. **Given** the EULA requirement, **When** the store listings are configured, **Then** the platform's
   EULA posture is decided and recorded (adopt Apple's Standard EULA and Google Play terms, or supply a
   custom EULA that meets Apple's minimum terms), and the app's Terms are consistent with it.

---

### User Story 3 - Every document is discoverable from the right place, on both surfaces (Priority: P2)

A customer never has to hunt for a legal document: it appears where the decision it governs is made —
consent at sign-up, refund/returns and delivery terms at checkout, marketing consent at newsletter
sign-up, the full set in the footer and in Account → Privacy & data, and the licenses/about
information in the mobile About screen — and each link resolves to the correct, current document.

**Why this priority**: Store policies require *accessibility*, not mere existence; and a document that
exists but is unlinked (the current `/legal/*` state, and the mobile Terms-opens-Privacy defect) fails
both the reviewer and the customer. This is lower than P1 only because it depends on the documents (P1)
existing first.

**Independent Test**: From each surface, verify every expected entry point (footer, sign-up consent,
checkout, newsletter, account privacy section, mobile About, public delete-account page, `/legal`
index) links to the correct document, and that no link is broken, points to the wrong document, or
opens a placeholder.

**Acceptance Scenarios**:

1. **Given** the sign-up screen, **When** a shopper reads the consent line, **Then** the named
   documents (Terms of Service, Privacy Policy) each link to the real, current document.
2. **Given** the mobile Account → Privacy & data screen, **When** the customer taps "Terms of service",
   **Then** the Terms open (fixing the current defect where it opens the Privacy screen).
3. **Given** the checkout flow, **When** a customer reaches the point of placing an order, **Then** the
   Terms of Service and the Refund/Returns/Cancellations policy are linked at that point.
4. **Given** the site footer on any web page, **When** a customer looks for legal information, **Then**
   every customer-facing document plus business identity/contact is linked from one place, and a
   `/legal` index page lists them all.

---

### User Story 4 - Documents are versioned so changes are transparent and provable (Priority: P3)

Each legal document carries a version and effective date, and superseded versions remain viewable, so
a customer (or a regulator, or a dispute) can see the terms that applied at a given time.

**Why this priority**: The version-history route already exists as an empty shell (`/legal/[type]/
versions`) and both stores and Australian privacy guidance expect a policy to show when it last changed.
It is P3 because a first publish only needs one version; history matters as documents evolve.

**Independent Test**: Confirm each document shows its current version and effective date, and that the
version-history view lists prior versions (or, at first publish, states clearly that this is the first
version).

**Acceptance Scenarios**:

1. **Given** any legal document, **When** a customer views it, **Then** its version identifier and
   effective/last-updated date are shown.
2. **Given** the version-history route for a document, **When** a customer opens it, **Then** they see
   the list of versions (with the current one marked), or a clear "this is the first version" state.

---

### Edge Cases

- **A document would have to lie to pass review.** If store acceptance would require stating something
  untrue of the built system (e.g. "your data is permanently erased after 30 days" while the erasure
  worker is not yet built — Dependencies), the document MUST describe current behaviour truthfully, and
  the gap MUST be recorded as a submission dependency rather than resolved by an inaccurate claim.
- **A real-world identifier is unknown.** Legal entity name, ABN/ACN, registered business address,
  governing-law jurisdiction, and the privacy/legal contact address are real-world identifiers. Per the
  platform's hard rule they are *asked for, never inferred* from session metadata, the git user, the
  domain, or anything the environment exposes. Where a value is not yet supplied, drafts MUST use an
  unmistakable placeholder that fails loudly (e.g. `[LEGAL ENTITY NAME]`), never a plausible guess.
- **A guest (no account) wants their data handled.** The public delete-account page already carries a
  guest data control; the Privacy Policy MUST describe the rights of a person who never created an
  account, not only account-holders.
- **Cross-border data.** Effy's processing uses overseas providers (payments, cloud, analytics, crash
  reporting, push). The Privacy Policy MUST disclose overseas disclosure (Australian Privacy Principle
  8) rather than implying all data stays in-country.
- **Marketing without consent.** Newsletter/marketing email is governed by the Spam Act and APP 7; the
  documents and the newsletter sign-up wording MUST reflect consent + unsubscribe, not opt-out-only.
- **A document is opened offline or the canonical page is down (mobile).** However mobile renders a
  document, the store-required privacy policy must remain *accessible within the app*; a link that only
  works when a remote page is reachable is a reviewer risk.
- **Wrong-document link.** Any entry point that resolves to the wrong document (the current mobile
  Terms→Privacy defect) is a defect even though "a legal page opened".

---

## Requirements *(mandatory)*

### Functional Requirements

#### The document set (what must be authored)

- **FR-001**: The feature MUST author a **Privacy Policy** as complete, reviewed-pending prose that
  discloses: the categories of personal information collected (account identity, contact details,
  delivery addresses, order and purchase history, payments, saved items, cart, device/push tokens,
  support communications, analytics and crash data); the purposes of collection; the parties it is
  disclosed to (payment processor, cloud/identity/email providers, product-analytics and
  crash-reporting providers, delivery operations, and any federated sign-in provider); retention
  periods and the specific categories retained after account deletion; security measures; overseas
  disclosure; how a person accesses, corrects, deletes their data or withdraws consent; cookies/
  tracking; children/minimum age; how to complain; and the contact for privacy enquiries.
- **FR-002**: The feature MUST author **Terms of Service** as complete, reviewed-pending prose covering:
  account creation and eligibility; ordering, pricing, GST, and product availability/substitutions;
  delivery (areas, timing, fees, minimums) and hidden-fulfilment nature of the service; order changes
  and cancellations; payment authorisation; consumer guarantees that cannot be excluded under
  Australian Consumer Law; prohibited/acceptable use; intellectual property; limitation of liability;
  suspension/termination; dispute resolution; governing law and jurisdiction; and how the Terms change.
- **FR-003**: The feature MUST author a **Refund, Returns & Cancellations Policy** (as its own document
  or a clearly identifiable Terms section) appropriate to grocery/perishable goods and consistent with
  Australian Consumer Law consumer guarantees, covering missing/damaged/incorrect items, perishable and
  non-perishable returns, cancellations before dispatch, and the refund method and timing.
- **FR-004**: The feature MUST author a **Cookie & Tracking Notice** (as its own document or a
  privacy-policy section) describing web cookies/local storage and the analytics and crash-reporting
  identifiers used on web and mobile, their purposes, and how a person can control them where possible.
- **FR-005**: The feature MUST establish an **Acceptable Use Policy** (as its own document or an
  identifiable Terms section) stating prohibited conduct on the platform.
- **FR-006**: The feature MUST decide and record the platform's **EULA posture** for the mobile apps —
  either relying on Apple's Standard Licensed Application EULA plus Google Play's terms (with the
  service governed by Effy's Terms of Service), or supplying a custom EULA — and if custom, the EULA
  MUST meet Apple's minimum terms (agreement solely between the user and Effy not Apple; Effy solely
  responsible for the app and its content; a limited, revocable, non-transferable licence; Apple named
  as a third-party beneficiary entitled to enforce).
- **FR-007**: The feature MUST provide an **Open-Source / Third-Party Licenses (Acknowledgements)**
  document/screen attributing the third-party components distributed in the apps.
- **FR-008**: The feature MUST provide a customer-facing **Business Identity & Contact ("About Effy")**
  document stating the operating legal entity, its Australian business number, registered/contact
  address, and the contact channels for support, privacy and legal enquiries.
- **FR-009**: Every document MUST use **approved or operator-supplied real-world identifiers only**.
  Legal entity name, ABN/ACN, registered address, governing-law jurisdiction, and contact addresses
  MUST be operator-supplied and MUST NOT be inferred; until supplied, drafts MUST carry unmistakable
  fail-loud placeholders. Contact email addresses MUST be an approved platform mailbox or an
  operator-confirmed address (the spec MUST NOT introduce a new address by guessing).
- **FR-010**: Every factual claim a document makes about the platform (data collected, sub-processors,
  retention categories, deletion behaviour, delivery/pricing/refund rules) MUST be **true of the system
  as built at authoring time**. Where the truthful statement is weaker than a store-ideal statement,
  the truthful statement wins and the gap is recorded (see Dependencies).

#### Rendering, structure and single-source

- **FR-011**: Each customer-facing document MUST be **rendered on the web storefront** at a stable,
  public, indexable, non-geofenced URL under a predictable scheme (the existing `/legal/*` and
  `/delete-account` routes are reused; new documents get sibling routes), reachable without signing in.
- **FR-012**: Each customer-facing document MUST be **available within the mobile app** in an easily
  accessible manner, such that the store-required documents (at minimum the Privacy Policy and Terms)
  are reachable in-app without leaving an obvious dependency on remote availability.
- **FR-013**: The substantive content of each document MUST come from a **single source of truth**
  shared across web and mobile so the two surfaces cannot drift; the same document reads identically on
  both (allowing for surface-appropriate presentation).
- **FR-014**: Each document MUST display a **version identifier and effective/last-updated date**, and
  the platform MUST provide a **version-history view** per document (reusing the existing
  `/legal/[type]/versions` route), showing prior versions or a clear first-version state.
- **FR-015**: A **`/legal` index page** MUST list every customer-facing legal/informational document in
  one place.

#### Wiring (where each document links)

- **FR-016**: The site-wide web **footer** MUST link every customer-facing document plus About/contact.
- **FR-017**: The **sign-up consent** text (web and mobile) MUST link the named documents (Terms of
  Service and Privacy Policy) to their real, current versions, with wording that distinguishes
  agreement (Terms) from acknowledgement (Privacy notice).
- **FR-018**: The **checkout** flow MUST link the Terms of Service and the Refund/Returns/Cancellations
  policy at the point of placing an order (web and mobile).
- **FR-019**: The **newsletter/marketing sign-up** MUST reference the Privacy Policy and reflect
  consent-based marketing with an unsubscribe path (Spam Act / APP 7).
- **FR-020**: The **Account → Privacy & data** section (web and mobile) MUST link the Privacy Policy,
  Terms of Service, Refund/Returns policy, Licenses/Acknowledgements, and account deletion.
- **FR-021**: The mobile app MUST provide an **About screen** exposing app version, business identity,
  the licenses/acknowledgements document, and links to the legal documents.
- **FR-022**: The existing mobile defect where **"Terms of service" opens the Privacy screen** MUST be
  fixed so each row opens its own document.
- **FR-023**: The public **`/delete-account`** page MUST remain reachable without the app, link to the
  Privacy Policy, prominently feature the deletion path, and name the app/developer (already built;
  this feature keeps it consistent with the authored documents and the store deletion URL).

#### Store-submission collateral (operator artifacts, not customer-facing)

- **FR-024**: The feature MUST produce an **Apple App Privacy details mapping**: every data type the
  app and its third-party SDKs collect, its purpose, whether it is linked to identity, and whether it
  is used for tracking — sufficient to fill the App Store Connect App Privacy questionnaire and
  consistent with the Privacy Policy.
- **FR-025**: The feature MUST produce a **Google Play Data safety mapping** covering the same data
  types, collection/sharing, security practices, retention and deletion — consistent with the Apple
  mapping and the Privacy Policy, and stating the in-app and web deletion paths.
- **FR-026**: The feature MUST document the **privacy policy URL and the account-deletion URL** to enter
  in both consoles, and MUST ensure the deletion URL cited in the Play Console equals the one cited in
  the Privacy Policy.
- **FR-027**: The feature MUST produce **App Store review notes** that instruct the reviewer to register
  a throwaway account before testing account deletion, without special-casing any account in code.
- **FR-028**: The feature MUST record any **outstanding submission dependencies** (e.g. the background
  erasure worker, new IAM for hard deletion, the store-console form entries and EULA configuration that
  only the operator can perform) so the submission checklist is complete and honest.

### Key Entities *(include if feature involves data)*

- **Legal Document**: A named, versioned, dated piece of customer-facing prose (Privacy Policy, Terms
  of Service, Refund/Returns/Cancellations, Cookie & Tracking Notice, Acceptable Use, EULA,
  Acknowledgements, About/Contact). Attributes: type/slug, title, effective date, version, body content
  (single source), and the surfaces/entry points that link to it.
- **Document Version**: A prior or current revision of a Legal Document, with an effective date and
  version identifier, viewable in the version-history route.
- **Data-Type Disclosure**: A row in the store-mapping artifacts pairing a category of collected data
  with its purpose, linkage-to-identity, tracking use, and the sub-processor(s) involved — the bridge
  between the Privacy Policy prose and the Apple/Google console forms.
- **Sub-processor / Third Party**: An external service that receives personal information (payment
  processor, cloud/identity/email provider, product-analytics provider, crash-reporting/push provider,
  federated sign-in provider), disclosed in the Privacy Policy and mapped in the store forms.
- **Store-Submission Item**: A single requirement in the App Store / Play submission checklist (in-app
  policy link, public policy URL, in-app deletion, web deletion URL, App Privacy mapping, Data safety
  mapping, EULA posture, reviewer notes), each with a satisfied/blocked state and, if blocked, its
  dependency.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the required customer-facing documents (Privacy Policy, Terms of Service, Refund/
  Returns/Cancellations, Cookie & Tracking Notice, Acceptable Use, EULA posture, Acknowledgements,
  About/Contact) exist as complete authored prose — zero placeholders remaining on any legal route on
  either surface.
- **SC-002**: Every factual claim in the Privacy Policy about collected data, sub-processors, retention
  categories and deletion behaviour is verified to match the system as built; a reviewer checking any
  claim against the platform finds it true (the SC-010 discipline, satisfied rather than deferred).
- **SC-003**: Both mobile apps satisfy every itemised App Store and Google Play legal/privacy/deletion
  requirement in the submission checklist, with no item left in a "blocked" state except those recorded
  as explicit external/operator dependencies.
- **SC-004**: The Apple App Privacy mapping, the Google Data safety mapping, and the Privacy Policy are
  mutually consistent — the same data types, purposes and sharing appear in all three with no
  contradiction.
- **SC-005**: Every entry point (footer, sign-up consent, checkout, newsletter, account privacy
  section, mobile About, `/delete-account`, `/legal` index) links to the correct current document on
  the correct surface, with zero broken or wrong-document links — including the fixed mobile
  Terms→Privacy defect.
- **SC-006**: The same document read on web and on mobile presents identical substantive content (no
  drift), demonstrable by comparing the two.
- **SC-007**: Each document shows a version and effective date, and each has a working version-history
  view.
- **SC-008**: The account-deletion URL entered for Google Play equals the URL cited in the Privacy
  Policy, and the public deletion page loads, features deletion prominently, and names the app/
  developer.
- **SC-009**: A person can locate and open any legal document from the storefront footer in a single
  step, and from the mobile Account area in no more than two steps.

## Assumptions

- **Jurisdiction is Australia.** The platform operates from Australia (Sydney) on the
  `effyshopping.com` domain and serves Australian customers; the documents are framed for Australian
  law — the Privacy Act 1988 and the Australian Privacy Principles, the Australian Consumer Law, and the
  Spam Act 2003 — as the primary regime. If Effy serves customers in other jurisdictions (e.g. the EU),
  additional regime coverage is a follow-on, not assumed here.
- **The documents are drafts for legal review.** The operator will have a lawyer verify and finalise
  the authored prose; the feature's job is correct, complete, well-structured drafts grounded in the
  real system, not final legal advice.
- **Real-world identifiers are operator-supplied.** Legal entity name, ABN/ACN, registered address,
  governing-law state, and privacy/legal/support contact addresses are provided by the operator and are
  never inferred; drafts use fail-loud placeholders until supplied. (The `support@effyshopping.com`
  address currently hard-coded in the built delete-account page is treated as operator-confirmed unless
  the operator says otherwise; new addresses are not invented.)
- **The retained-data categories are those the system already enforces** — completed orders, payment
  records, and fraud/security signals (per the closure service's `RETAINED` set) — and the Privacy
  Policy describes these rather than a different set.
- **Existing routes and mechanics are reused, not rebuilt.** `/legal/privacy`, `/legal/terms`,
  `/legal/[type]/versions`, `/delete-account`, the mobile Privacy & data screen and the account-closure
  flow already exist; this feature fills, corrects, extends and wires them.
- **Third-party/sub-processor list is derived from the built stack** (payments, cloud identity, email,
  product analytics, crash reporting, push, federated sign-in) as it exists today; if a provider is not
  actually integrated, it is not claimed.

## Dependencies

- **Background erasure worker (SUBMISSION-BLOCKERS Blocker 1).** The Privacy Policy's deletion language
  must not promise permanent erasure the platform does not yet perform. Either the deletion prose
  describes current behaviour truthfully, or the erasure worker (and its new Cognito `AdminDeleteUser`
  IAM and backup/restore-safety story) is delivered so the ideal language becomes true. This feature
  surfaces the choice; it does not build the worker.
- **Operator-only store actions.** Filling the App Store Connect App Privacy questionnaire, the Play
  Console Data safety form, entering the policy and deletion URLs, configuring the EULA, and uploading
  review notes are operator actions the feature enables with documented mappings but cannot perform.
- **Legal review.** Final publication depends on the operator's lawyer verifying the drafts.
- **Operator-supplied identifiers (FR-009).** Final documents cannot be published until the entity,
  ABN, address, jurisdiction and contact values replace the placeholders.
