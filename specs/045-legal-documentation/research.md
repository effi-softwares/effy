# Research: Legal & Informational Documentation

Phase 0 decisions. Each resolves a Technical Context choice or a spec Dependency. Store/law citations
that drive the document *content* are captured here (R6–R10) so the authoring phase writes to a
grounded standard rather than from memory.

---

## R1 — Single source of truth for legal content (Principle II)

**Decision**: One canonical Markdown corpus in a new shared package **`@effy/legal-content`**. Web
imports it and renders on the server. Mobile consumes a **generated, committed Kotlin copy** produced
by `legal:gen`, with `legal:check` failing the build if the mobile copy drifts from the canonical
source or if any real-world-identifier placeholder is still unresolved.

**Rationale**: FR-013 requires the same words on both surfaces with no drift, and Principle II forbids
copy-paste of cross-cutting content. The platform already has two working instances of exactly this
"authored source → committed generated artifact → drift guard" shape — `@effy/design-system`
(`tokens:gen`/`tokens:check`, which emits per-app Compose files) and `@effy/brand`
(`brand-gen`/`brand-check`). Reusing the proven pattern means the mobile app ships the real words with
**no network dependency**, which also answers the store "accessible within the app" requirement more
robustly than an in-app browser to a remote URL.

**Alternatives considered**:
- *Mobile opens the canonical web URL in an in-app browser (Custom Tab / SFSafariViewController).*
  Accepted by both stores, but the spec's own edge case flags the remote-availability risk, and it
  makes offline/roaming access fail. Rejected as the primary mechanism (kept as an acceptable fallback
  for very long ancillary docs if a native render proves heavy).
- *Duplicate the prose by hand in Kotlin.* Direct Principle II violation; guaranteed to drift.
- *Serve documents from a backend.* Adds a path with no latency or CRUD justification (Principle III),
  and versioned static legal text has no reason to be dynamic.

## R2 — Web Markdown rendering

**Decision**: Render the constrained Markdown subset (headings, paragraphs, lists, links, emphasis,
tables for the refund/returns matrix) with a **small, self-contained server-side renderer** — a vetted
lightweight Markdown library added under the locked Web standard, used **only in server components** so
it contributes **zero client JS** to the guest bundle. No live client interactivity on a reading page.

**Rationale**: These are static documents; the guest-bundle gate (174 KB) is the constraint, and a
server-only render keeps client cost at zero. A new utility library is permitted within the Web
standard (constitution: a plan MAY add a React/Go utility, it MUST NOT swap a locked technology).

**Alternatives considered**: MDX (heavier, compile-time route coupling, overkill for prose);
hand-authoring each document as JSX (defeats the shared-source model and invites drift).

## R3 — Mobile Markdown rendering (IMPLEMENTED)

**Decision**: A **dependency-free Markdown→Compose renderer** over the same constrained subset, driven
by the generated `LegalContent.kt`. A tiny Kotlin parser (mirror of `markdown.ts`) produces typed
blocks; blocks map to `Text`/`Column`/rows using design-system typography; inline links use
`AnnotatedString` + `LinkAnnotation.Clickable` (stable since Compose 1.7 / CMP 1.11) — internal
`/legal/<slug>` links navigate in-app, external `http` links open via `LocalUriHandler`. Rendered in a
`Column` + `verticalScroll` (docs are a few KB; no `LazyColumn` needed). `LegalMarkdown.kt` +
`LegalScreens.kt`, package `features/legal/presentation`.

**Rationale**: Evaluated three options —
- **`multiplatform-markdown-renderer` (mikepenz)** — mature, but adds a dependency (+ JetBrains-Markdown
  + Coil) and parses full CommonMark when we ship a tiny controlled subset. Rejected: dependency/version
  risk against the project's minimal-dependency doctrine.
- **Compose Multiplatform resources (files)** — bundles static files, but we already bundle via the
  drift-guarded generated Kotlin, which is a better single-source story. Rejected.
- **✅ Dependency-free renderer** — no new KMP dependency, offline, bundled, negligible cost, and reuses
  the one subset definition. Chosen.

Native feel (Principle V) and offline access hold. Two commonTests cover it: every document parses to
≥1 block, and every internal link resolves to a known document. ⚠ The `LinkAnnotation` text-link API is
the one area a first Gradle compile may need a minor tweak (it cannot be compile-checked without the
KMP toolchain).

## R4 — Versioning model

**Decision**: Each document directory holds one file per version with front-matter
(`title`, `version`, `effectiveDate`, `status`), and `manifest.ts` names the **current** version. The
web `/legal/[type]/versions` route lists versions from the manifest (marking current); at first publish
each document is `v1` and the history view states that plainly. No database — history is the committed
file set.

**Rationale**: Both stores and APP 1 guidance expect a visible "last updated"; disputes need the terms
that applied at a time. Git already immutably records history; the manifest surfaces it to customers
without a storage tier.

**Alternatives considered**: a DB-backed version table with per-user consent records — deliberately out
of scope (the spec does not require recording which version a user agreed to; adding it would pull in a
migration and a backend for no FR).

## R5 — Reading-page layout (Principle V, "no card layouts")

**Decision**: A single-column, max-width reading measure; document title + version/effective-date meta
row; sectioned headings with a table-of-contents/anchor list for long documents; lists and detail rows;
a bordered table **only** for the refund/returns matrix (a table is the right pattern for that content).
**No cards, no metric tiles.** Storefront light-only appearance on web; Light/Dark/Follow-System on
mobile.

**Rationale**: Constitution Principle V prefers "tables, lists, sectioned pages, tabs, and detail rows"
and bans card-tiled layouts; long-form legal text is the archetypal sectioned reading page.

## R6 — Apple App Store requirements (drives US2 / FR-024, FR-027, and the Privacy Policy)

**Decisions grounding the content and collateral**:
- **5.1.1(i)** — a privacy policy link in App Store Connect metadata **and** in the app "in an easily
  accessible manner"; it must identify what data is collected, how, all uses, retention/deletion, and
  how a user revokes consent / requests deletion. → Privacy Policy content requirements (FR-001) and
  in-app + public URL (FR-011/FR-012).
- **5.1.1(v)** — apps with account creation must let users **initiate deletion from within the app**;
  deactivation alone is insufficient; if a website finishes the process, link directly to it. → in-app
  deletion already built (034); `/delete-account` is the direct web link.
- **App Privacy details ("nutrition labels")** — every data type the app **and its third-party SDKs**
  collect must be declared (Data used to track / linked to you / not linked to you); Privacy Manifests
  (strictly enforced 2026) declare API usage and SDK data; ATT if any cross-app tracking. → the
  Apple mapping (FR-024) and a note that the SDK inventory (analytics, crash, push, payments, sign-in)
  must be reflected in the app's privacy manifest.
- **EULA** — Apple's Standard Licensed Application EULA applies by default; a custom EULA is optional
  but, if supplied, must state the agreement is solely between user and developer (not Apple), the
  developer is solely responsible, the licence is limited/revocable/non-transferable, and Apple is a
  third-party beneficiary. → R9.

Sources: App Review Guidelines (developer.apple.com/app-store/review/guidelines/); Account-deletion
requirement (developer.apple.com/news/upcoming-requirements/?id=06302022b); App Privacy Details
(developer.apple.com/app-store/app-privacy-details/); Standard EULA
(apple.com/legal/internet-services/itunes/dev/stdeula/).

## R7 — Google Play requirements (drives US2 / FR-025, FR-026, and the deletion wiring)

**Decisions**:
- Privacy policy link in **Play Console and in the app**, backed by an active, publicly accessible,
  **non-geofenced** URL. → FR-011.
- **Data safety form** is mandatory every submission; disclosures must **match the privacy policy**;
  inconsistent answers trigger review flags. → the Google mapping (FR-025) is authored *from* the
  Privacy Policy so they cannot disagree (SC-004).
- **Account deletion** must be offered **in-app AND via a web URL** to delete/request deletion; the URL
  entered in the Data safety deletion section **must equal** the URL cited in the privacy policy; the
  page must be functional, prominently feature deletion, and reference the app/developer name. →
  `/delete-account` already satisfies the page criteria; FR-026/SC-008 pin the URL equality.
- Data **retention and deletion** policy must be explained in the privacy policy. → FR-001.

Sources: Play account-deletion requirements
(support.google.com/googleplay/android-developer/answer/13327111); Data safety form guide (2026,
applander.io); Play User Data policy (as summarised in the same).

## R8 — Australian legal frame (drives Privacy Policy, Terms, Refunds content)

**Decision**: Author for **Australian law** as the primary regime:
- **Privacy Act 1988 + 13 Australian Privacy Principles** — APP 1 (open, transparent, accessible
  policy), APP 5 (collection notice at/before collection), APP 7 (direct marketing needs consent —
  binds the newsletter), APP 8 (cross-border disclosure — Effy uses overseas providers, must be
  disclosed), APP 11 (security), APP 12/13 (access & correction). Include the OAIC complaint path.
- **Australian Consumer Law** — non-excludable consumer guarantees; the Terms and the Refund/Returns
  policy must not purport to exclude them, and must state them for perishable/grocery goods.
- **Spam Act 2003** — marketing email requires consent + a functional unsubscribe; reflected in the
  newsletter wording (FR-019) and the Privacy Policy.
- **Notifiable Data Breaches scheme** — the Privacy Policy states the breach-response posture.

If Effy later serves other jurisdictions (e.g. the EU/GDPR), that is a follow-on regime, not assumed.

Sources: Privacy Act / APP e-commerce guidance (gladwinlegal.com.au; oaic.gov.au principles as
referenced); consumer-guarantee framing (ACL). Citations to be finalised with the lawyer.

## R9 — EULA posture (FR-006)

**Decision**: **Adopt Apple's Standard Licensed Application EULA** for iOS and **Google Play's standard
terms** for Android; Effy's **Terms of Service** govern the *service* (ordering, delivery, payment).
Do **not** ship a custom EULA unless the lawyer requires one. `@effy/legal-content` carries an `eula`
document that records this posture and, if a custom EULA is later mandated, holds text meeting Apple's
minimum terms (R6).

**Rationale**: The Standard EULA is sufficient and is the default; a custom EULA adds a maintenance
surface and a rejection risk (its minimum terms are easy to get wrong) for no benefit given the Terms of
Service already govern the commercial relationship. Recorded so the store listing is configured
intentionally (no custom-EULA link shown).

## R10 — Sub-processor / data-type inventory (drives FR-001, FR-024, FR-025 — must be true, SC-002)

**Decision**: The Privacy Policy and both store mappings enumerate exactly the data and third parties
the **built** platform uses, derived from the codebase, not a generic template:
- **Identity/auth**: AWS Cognito (email, name; Google federated sign-in linked to one `sub`).
- **Payments**: Stripe (card data handled by Stripe Elements/PaymentSheet — the platform never stores
  card numbers; it retains payment *records*).
- **Cloud/email**: AWS (RDS, S3, SES for transactional + OTP email).
- **Product analytics / web error tracking**: PostHog (note: not yet initialised on customer-web).
- **Crash reporting**: Firebase Crashlytics (mobile).
- **Push**: FCM (+ APNs for iOS) via the notifications path.
- **Data categories**: account identity, contact details, delivery addresses, order/purchase history,
  payment records, saved items, cart, device/push tokens, support messages, analytics/crash data.
- **Retained after deletion** (from `apis/edge-api/customer/src/closure/service.ts` `RETAINED`):
  completed orders, payment records, fraud/security signals — and **only** these.

**Rationale**: SC-002 requires every claim true of the system. A provider not actually integrated is not
listed; a data type not actually collected is not declared. This inventory is the shared spine that
keeps the Privacy Policy, the Apple questionnaire and the Google form mutually consistent (SC-004).

## R11 — The erasure-worker dependency (spec Dependencies, 034 Blocker 1)

**Decision**: Write the Privacy Policy's deletion language to be **true of current behaviour** — an
account is closed immediately, sessions end, access is refused on both paths, and the retained
categories (R10) are kept per stated retention periods — **without** asserting a specific "permanently
erased after N days" guarantee the platform does not yet perform. Record, in `submission-checklist.md`
and Dependencies, that the stronger erasure claim unlocks only when the background erasure worker (+ its
new Cognito `AdminDeleteUser` IAM and restore-safety story) ships.

**Rationale**: FR-010/SC-002 forbid an untrue claim; building the worker is out of this slice's scope.
The honest weaker statement is store-acceptable and legally safer than an unmet promise.

## R12 — Real-world identifiers (constitution § Real-World Identifiers, FR-009)

**Decision**: `identifiers.ts` holds the legal entity name, ABN/ACN, registered address, governing-law
state, and privacy/legal contact — each defaulting to an **unmistakable placeholder** (e.g.
`[LEGAL_ENTITY_NAME]`). `legal:check` **fails** if any placeholder remains, so publish is mechanically
blocked until the operator supplies real values. Contact email uses an **approved mailbox**
(`hello@`/`workspace-admin@`) or the already-shipped `support@effyshopping.com` (operator-confirmed);
the banned `techsupport+claudeone@phantm.com` appears nowhere.

**Rationale**: Directly implements the constitution's non-negotiable identifier rule and its "fail
loudly" mandate; the lawyer/operator fills the values at review time.
