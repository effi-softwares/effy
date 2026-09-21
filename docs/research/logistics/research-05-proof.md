# Research 05 — Proof of Delivery and Chain of Custody for Effy (Melbourne grocery, hub-and-spoke)

> **Research method note (read first):** This session's web-search quota (200 calls, shared across the
> whole Claude session/environment) was exhausted after ~12 searches, all spent early on the highest-value
> queries (POD vendors, Australia Post, Amazon, Victorian liquor law, FSANZ, OAIC, ETA 1999). All
> subsequent research used **WebFetch only**, and a majority of WebFetch attempts against primary legal
> sources (AustLII, legislation.vic.gov.au, legislation.gov.au) returned `403`/`404`/`523`/timeout — these
> sites actively block automated fetching. Where a claim rests on a WebFetch/WebSearch result that
> genuinely returned content, it is cited with a URL. Where a claim is standard industry practice I am
> confident of from training but **could not independently re-verify this session**, it is explicitly
> marked **[UNVERIFIED THIS SESSION]**. Nothing below is presented as verified when it was only guessed.

---

## §1. Proof methods — what each proves, who uses it, when appropriate

| Method | What it actually proves | Who uses it | Notes |
|---|---|---|---|
| **Signature capture** (finger/stylus on screen) | *Consent/acknowledgement* that a named person accepted the goods at that time. Does **not** prove identity — a scrawl proves nothing about who drew it. | Universal (DHL, UPS, FedEx, Australia Post Signature on Delivery, Onfleet, Detrack, Track-POD) | Onfleet/Detrack both support pre-signing via SMS link before the driver arrives, to cut door-time [onfleet.com/blog/proof-of-delivery](https://onfleet.com/blog/proof-of-delivery/) [detrack.com/blog/a-deep-dive-into-detracks-electronic-proof-of-delivery-features](https://www.detrack.com/blog/a-deep-dive-into-detracks-electronic-proof-of-delivery-features/). |
| **Photo of package at location** | *Physical placement* of the goods at a GPS-tagged point at a given time. Does not prove the *recipient* got it, only that something was left somewhere. | Amazon Photo on Delivery, Australia Post Safe Drop, Onfleet, Detrack (up to 10 photos/stop), Track-POD | Amazon takes delivery photos for ~70–80% of packages, mainly unattended residential drops, specifically to deter theft and resolve "where's my stuff" disputes [amazon.com Photo on Delivery](https://www.amazon.com/gp/help/customer/display.html?nodeId=GEE76GMYKN4HEYLK). Amazon suppresses the photo for addresses flagged confidential (Wish List/Registry) — a privacy carve-out worth copying. |
| **Photo of ID / age verification scan** | *Age/identity* of the person accepting a regulated item. | Onfleet (built-in gov-ID check "critical for regulated items like alcohol or cannabis"), most alcohol-delivery operators | [onfleet.com/blog/proof-of-delivery](https://onfleet.com/blog/proof-of-delivery/). Storing a photographed ID is itself a privacy liability (see §3) — best practice is "sighted, not retained" unless there's a specific compliance reason to keep it. |
| **Recipient name (typed/selected)** | A claimed identity, self-reported and unverified, paired with a signature or photo. | Detrack, Track-POD | Weak alone; strong paired with signature+photo. |
| **One-time delivery PIN/code** | *Possession* of the code, which (if sent only to the customer's verified channel — SMS/email/app) is a decent proxy for "the right person or someone they authorised is present." | Widely used by food-delivery/parcel apps for handoff confirmation; also the exact mechanism Effy tore down and is rebuilding | Strongest low-friction method for **attended handoff** — cannot be faked by the driver alone (driver doesn't know the code), unlike a photo or a self-drawn signature. |
| **Barcode/QR scan** | *Which specific parcel/order* was actioned, and *when*. Proves item identity, not recipient identity. | Onfleet (multi-barcode per delivery, can be mandatory) [onfleet.com/blog/capturing-barcodes-with-onfleet](https://onfleet.com/blog/capturing-barcodes-with-onfleet/), virtually all parcel carriers for scan-events | Essential for shop pickup and hub check-in reconciliation (§2); largely irrelevant at the final customer doorstep for a grocery order (nobody scans their own groceries). |
| **NFC/RFID** | Same as barcode but tap-based; common in high-volume parcel/asset tracking, rare in last-mile food/grocery. | Enterprise logistics, some asset-tracked equipment | **[UNVERIFIED THIS SESSION as a live grocery-delivery pattern]** — not something any grocery operator in my source set uses at the doorstep. Low priority for Effy. |
| **Geofence + GPS stamp** | *Location* the capture event happened, checked against the expected address. | Detrack "Smart Geofencing" — "automatically verifies the driver's GPS location at the point of delivery" [detrack.com deep-dive](https://www.detrack.com/blog/a-deep-dive-into-detracks-electronic-proof-of-delivery-features/); Onfleet "geostamping" for chain-of-custody [onfleet.com/blog/proof-of-delivery-apps-couriers](https://onfleet.com/blog/proof-of-delivery-apps-couriers/) | Core anti-fraud signal (§10), not a customer-facing proof by itself. |
| **Timestamp** | *When* the event occurred. | Universal | Table stakes; must be device clock **and** server-received time (device clocks can be manipulated — see §10). |
| **Contactless / "leave-at-door"** | Authorisation was pre-granted (at checkout or via app) to leave goods unattended; photo substitutes for signature. | Australia Post Authority to Leave / Safe Drop, Amazon, Uber Eats, DoorDash | Australia Post: driver decides on the day whether the spot is actually safe, even if ATL was requested — "the driver will only leave the parcel if there's a safe place on the property," defined as "not visible at the boundary of the premises"; if not, a card is left for pickup [auspost.com.au/…what-is-a-safe-drop](https://auspost.com.au/business/business-ideas/ecommerce-jargon-busters/what-is-a-safe-drop) [auspost.com.au/…what-is-authority-to-leave](https://auspost.com.au/business/business-ideas/ecommerce-jargon-busters/what-is-authority-to-leave). **Liability transfers to the recipient once left under ATL** — loss/theft/damage after that point is not covered by AusPost's standard compensation. This is the load-bearing legal fact Effy should copy into its own T&Cs. |
| **"Safe place" selection** | Customer-nominated instruction ("behind the pot plant", "with concierge"). | Australia Post (settable per-parcel or as a standing MyPost preference), most grocery apps | Distinguish from generic ATL: a *specific* instruction, which is stronger evidence the customer authorised exactly that outcome. |
| **Age verification (challenge + visual check)** | Recipient meets a minimum age for a restricted good. | Legally mandated for alcohol in Victoria (§3) | Not optional for Effy if it ever sells alcohol; currently out of scope per the brief but worth designing the schema to support (a `requires_age_check` flag on package/line, not bolted on later). |

---

## §2. Per-custody-event recommendation (these are deliberately different)

### 2a. Shop pickup (driver ← fulfilment shop)
**Goal: reconcile "what the shop says it handed over" vs "what the driver says they took," at the moment of highest information asymmetry** (the shop packed it, the driver is trusting a label).

- **Scan-on-pickup is the primary proof**, not a photo or signature. Parcel networks and 3PLs reconcile
  collection this way: each parcel/package barcode is scanned into the driver's manifest at collection,
  and the collection is only "complete" when the scanned set is compared against the shop's expected
  manifest (what the shop's own system says it packed for that run). This is standard 3PL/network practice
  — Onfleet supports "multiple barcodes scanned as part of a single delivery" and can make the scan
  mandatory [onfleet.com/blog/capturing-barcodes-with-onfleet](https://onfleet.com/blog/capturing-barcodes-with-onfleet/).
- **Exception reporting at the point of variance**, not after the fact: if the driver's scanned count is
  short against the shop's manifest, the driver should be forced to declare *why* before the run can
  advance (shop-side shortage / shop didn't have it ready / item damaged at handover) — this is what
  prevents "missing" from silently becoming "lost in transit," which is a liability question the shop and
  the platform will otherwise argue about after the fact with no record.
- **A photo is USEFUL, not essential**, for damaged-at-pickup or mismatched-item disputes — it protects
  the driver ("I received it already damaged") as much as it protects Effy.
- **No signature is needed here** — the shop is an Effy-controlled fulfilment node (per the platform
  model), not an independent third party requiring a formal handover document. A scan-count
  reconciliation with a shop-side "confirm handover" tap in the shop console is enough; a wet or digital
  signature adds friction without adding legal weight between two parts of the same operation.
- **What NOT to build**: seal numbers (used for trailer/container-level parcel-network integrity, not
  relevant to a driver picking up bagged grocery orders from a single shop they physically watch being
  loaded); per-item photo at pickup (excessive — see §5 OVERKILL items).

### 2b. Hub check-in (driver → hub)
**Goal: this is the platform's own internal control point — reconcile the collection run against the same-day/standard split that checkout already decided (per CLAUDE.md: sortation is a known fact, not a manual step).**

- **Scan-in against the collection manifest**, same mechanism as pickup, run in reverse: every package
  the driver scanned onto their run at the shops must be scanned off at the hub, and a **discrepancy
  (short, or an unexpected extra) must be a hard stop that produces a named exception**, not a silently
  dropped count. This mirrors warehouse inbound-receiving discipline: inbound receiving in WMS practice
  exists specifically to reconcile "what was expected to arrive" against "what physically arrived," with
  discrepancies routed to exception handling rather than being absorbed silently.
  **[Confidence: this is standard WMS/3PL doctrine — I could not independently re-fetch a specific
  Manhattan/Blue Yonder/ShipHero source this session after the search budget ran out; treat the specific
  named-vendor citation as UNVERIFIED THIS SESSION, but the practice itself is uncontroversial industry
  standard.]**
- **No customer-facing proof artifact is needed at this step** — the hub is internal. What's needed is an
  **operational record**: which driver checked which package in, at what hub, at what time, and — because
  this is exactly where the same-day/standard split becomes physically real — **which packages were
  physically confirmed present for the same-day round versus handed to the third-party carrier**. A
  missing package here is the single highest-value exception Effy can catch, because it's the last point
  the platform has custody before a third party takes over the standard leg.
- **A single hub-level "batch confirm" gesture, not per-package confirmation UI**, is the right driver UX
  — the reconciliation logic (comparing scanned-in against expected) should do the work; the driver's job
  is to scan everything and resolve the (hopefully rare) flagged exceptions.

### 2c. Customer delivery (driver → customer / their door)
**Goal: prove attended or authorised-unattended handoff, in a way a customer, a chargeback dispute, or (for alcohol) a regulator would accept — fast enough to do 30+ times a day.**

- **Attended delivery (the default and, per the constraints below, the only legal option for alcohol):**
  **one-time delivery PIN** shown/known only to the customer (via their order confirmation / app), typed
  or selected by the driver at the door, is the strongest low-friction proof of *the right person or
  someone they authorised* — a driver cannot self-generate it the way they can a photo or a
  self-drawn signature. Pair with a timestamp + geofence check, no photo needed for a routine attended
  drop (adds friction for no legal or dispute-resolution benefit over the code).
- **Contactless/leave-at-door (only where the customer pre-authorised it, and only for non-restricted
  goods):** **photo of the package at the exact drop location** is the standard and sufficient proof —
  this is exactly Amazon's and Australia Post's model. Authorisation (the ATL choice) must be captured
  **before** the driver arrives (checkout-time preference, per Australia Post's model), and the driver
  retains the final say on whether the spot is actually safe that day — Australia Post's own rule is that
  ATL is a customer *preference*, overridable by the driver's on-the-ground judgement
  [auspost.com.au/…what-is-a-safe-drop](https://auspost.com.au/business/business-ideas/ecommerce-jargon-busters/what-is-a-safe-drop).
  Recommend Effy copy this exactly: **ATL is a request, never a guarantee** — a driver who judges the
  location unsafe must be able to fall back to attended/PIN without the app treating that as an error.
- **Age-restricted lines (if/when Effy sells alcohol):** cannot use contactless at all — see §3. Requires
  attended handoff + visual ID check + (recommended) a captured note of ID sighted (NOT a stored photo of
  the ID itself — see §3/§6 privacy posture) + signature or PIN, and a **hard refusal path** (the app
  must let the driver mark "refused — could not verify age" or "refused — recipient intoxicated" and this
  must **not** silently register as a successful delivery).
- **What NOT to build for grocery**: barcode/QR scan at the customer's door (nothing for the customer to
  scan); NFC/RFID handoff (no reader hardware in a customer's hand); a full photo of every item unpacked
  on the doorstep (overkill — see §5).

---

## §3. Australian legal and food-safety obligations

### 3a. Alcohol delivery — Victoria (Liquor Control Reform Act 1998)
**What I could verify:** the Act makes it an offence to knowingly deliver liquor to a minor, with a
**"reasonable excuse" defence that requires the deliverer to have sighted evidence-of-age documentation**
showing the recipient is 18+ [WebSearch synthesis of legislation.vic.gov.au / austlii.edu.au — I was
unable to independently WebFetch the primary section text this session because AustLII and
legislation.vic.gov.au both returned `403`/`523` to automated fetch; treat the exact section number as
**unconfirmed** even though the substantive rule is corroborated by two independent search results].

VCGLR guidance (search-engine cached content, primary page returned `523` on direct fetch — **content
below is as reported by the search snippet, not independently re-verified against the live VCGLR page this
session**):
- For same-day delivery of online liquor orders, the licensee must give the delivery driver **written
  instructions not to leave the delivery unattended**.
- It must be delivered **to a person who is not intoxicated and not a minor**.
- **It is an offence to knowingly supply an online order to a person who is intoxicated**, or where there
  is a substantial risk of intoxication.
- Source: [vcglr.vic.gov.au/news/supplying-or-delivering-takeaway-liquor-do-right-thing](https://www.vcglr.vic.gov.au/news/supplying-or-delivering-takeaway-liquor-do-right-thing)
  (fetch of the live page failed with `523 Unknown Status` this session — **flag for a follow-up fetch
  before this is relied on for a compliance decision**).

**What this means concretely for a driver app, if Effy ever sells alcohol:**
1. Alcohol lines must be flagged so the app enforces **attended delivery only** — no ATL/contactless
   option is legally available for these lines.
2. The driver must be forced through an **explicit age/sobriety check gate** before the delivery can be
   marked complete for that line — not a general "delivered" button that happens to also cover an alcohol
   item.
3. The app must support a genuine **refusal outcome** (age not verifiable, recipient appears intoxicated,
   recipient appears to be a minor) that does not silently fall through to "delivered."
4. **Do not store a photo of the customer's ID** as the compliance record — sight it, log *that* it was
   sighted (method, driver, timestamp), not a copy of the document itself; a stored photographed driver's
   licence is a much higher-value target for a data breach than almost anything else Effy could hold (see
   §3c).
5. **This entire section is currently out of scope for Effy per the brief** ("grocery delivery," no
   alcohol mentioned) — flagged here only so the schema doesn't have to be redesigned later if/when it is
   added. **Recommend a nullable `requires_attended_handoff` / `restricted_category` flag on the package
   or line level now**, unused today, rather than retrofitting it.

### 3b. Food safety — FSANZ Standard 3.2.2 and the Food Act 1984 (Vic)
**Verified via FSANZ's own consumer-facing fact sheet** [foodstandards.gov.au/business/safety/factsheets/receivingfoodsafely](https://www.foodstandards.gov.au/business/safety/factsheets/receivingfoodsafely):
- **Potentially hazardous (perishable) food must be at ≤5°C (chilled) or ≥60°C (hot) at the point of
  receipt/display/transport/storage.** Frozen food must arrive "frozen and not partly thawed."
- The **receiving business** (i.e., whoever takes custody of the food next) is the one responsible for
  checking this — "if a food transporter cannot demonstrate to the receiving business that the temperature
  of the food is safe, the delivery must not be accepted," and the receiving business "must reject" food
  that fails the check.
- Verification methods FSANZ describes: checking a truck's temperature data logger if one exists, or
  probe-testing a sample; for foods moved under an **agreed time-limit** model rather than continuous
  temperature control, checking **departure/arrival timestamps** against the agreed limit is an accepted
  alternative to continuous logging.

**What this means for Effy specifically — and where I must flag uncertainty:**
- The legal obligation as written is framed around **business-to-business receiving** (a retailer
  receiving from a supplier). **I could not verify, this session, a specific FSANZ or Victorian
  requirement that mandates continuous in-vehicle temperature logging for a last-mile grocery delivery to
  a private residence** — the standard I *can* verify requires the food to arrive at temperature and lets
  a time-limit model substitute for continuous logging. Effy (as the entity ultimately responsible under
  the Food Act 1984 (Vic) for food it sells being safe — [health.vic.gov.au/food-safety/the-food-act-1984](https://www.health.vic.gov.au/food-safety/the-food-act-1984)) is the "receiving/selling business" in
  this chain relative to the customer, and general guidance is that food businesses are legally
  responsible for food sold to customers being safe and suitable. **This is a real compliance surface —
  Effy should get its own food-safety/EHO advice on exactly what's required for last-mile transport
  specifically**, rather than relying on this research pass. What I recommend building regardless of the
  exact legal floor (see §5/§6) is a **time-in-transit ceiling per package as the primary control**
  (matches FSANZ's own "agreed time limit" alternative-compliance path) plus **insulated bags/totes as
  physical control**, with actual temperature-probe logging as a nice-to-have, not something I can
  confirm is currently mandated for a business Effy's size and model.
- Vehicle/transport cleanliness and covering unpackaged food are described as standard requirements in
  secondary sources (temporary-food-business guidance, not the primary Act text, which I could not fetch
  directly this session) [casey.vic.gov.au temporary food business guidelines PDF]. Grocery orders are
  almost entirely pre-packaged, so this is lower-risk for Effy than for a caterer, but still worth a
  driver-app checklist item ("bags sealed/closed on handover").

### 3c. Privacy — Privacy Act 1988 (Cth), APP 11
**Verified directly from OAIC's own guidance** [oaic.gov.au/…chapter-11-app-11-security-of-personal-information](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)
and [oaic.gov.au/…photos-and-videos](https://www.oaic.gov.au/privacy/your-privacy-rights/social-media-and-online-privacy/photos-and-videos):

- **A delivery photo showing a person's face, or a house/address identifiable to a specific person, is
  "personal information" under the Privacy Act** whenever "your identity is clear or could reasonably be
  worked out" from it — this is a real, not theoretical, classification: a doorstep photo that shows a
  house number, a name on a mailbox, or a person's face all likely qualify.
- **APP 11.1 (security):** Effy must take "reasonable steps" to protect POD photos/signatures from misuse,
  loss, and unauthorised access — OAIC's guidance expects both technical controls (encryption, access
  control) and organisational controls (policy, training), scaled to sensitivity and the entity's
  resources. For Effy: private S3 + presigned URLs (already the stated architecture) is directionally
  correct; the missing piece is **who inside Effy can list/browse the bucket**, which needs to be
  access-controlled as tightly as the presign flow itself.
- **APP 11.2 (destruction):** once information is **"no longer needed for any purpose for which [it] may
  be used or disclosed"** under the APPs, Effy must take reasonable steps to destroy it or de-identify it
  — **OAIC gives no specific retention period**; "reasonable" is fact-dependent (sensitivity, org size,
  practicality). **This means Effy needs to pick and document its own retention window** rather than
  relying on an external legal number, because none exists in the guidance I could verify. See §6 for a
  concrete recommendation.
- Practical implication: **do not retain POD photos indefinitely by default.** A dispute-resolution window
  (e.g., long enough to cover chargebacks/complaints) is a legitimate purpose; retention beyond that
  purpose is the exact thing APP 11.2 exists to prevent.

### 3d. Electronic signatures — Electronic Transactions Act 1999 (Cth)
**Verified via WebSearch synthesis (direct AustLII/legislation.gov.au fetch of the section text was
blocked, `403`, this session — the general-rule text below is corroborated by two independent
professional-services summaries, DocuSign and OneSpan, but I could not pull the primary statute text
directly)**:
- The Act's general rule: a transaction is **not invalid** merely because it happened wholly or partly by
  electronic means.
- For an electronic signature to be legally recognised it must (i) identify the signer, (ii) indicate
  their intent to sign/approve, and (iii) use a method that is **reliable** and to which the other party
  **consented**.
- Certain document classes are excluded from the Act (wills, powers of attorney, some land dealings) — not
  relevant to a delivery receipt.
- **Practical takeaway for Effy**: a finger-drawn signature on a driver's phone, tied to a named recipient,
  a timestamp, and a device/session audit trail, is legally meaningful under Australian law as evidence of
  intent-to-accept — it is not, however, strong *identity* evidence (see §1), so it should not be Effy's
  sole proof for anything higher-stakes than "this package was accepted here."
- **Recommend independent legal confirmation of the exact ETA 1999 section number and Victorian
  equivalent (Electronic Transactions (Victoria) Act 2000) before this is relied on in a dispute** — I
  could not pull primary text this session.

---

## §4. Exception/failure taxonomy — a concrete reason-code list to ship

Organised per custody event, because a "failed pickup" and a "failed delivery" are different animals and
conflating them into one enum is exactly the kind of drift this codebase's CLAUDE.md repeatedly calls out
as a recurring defect shape.

**Shop pickup exceptions** (`pickup_exception_reason`):
- `shop_short` — shop had fewer units/packages ready than the manifest expected
- `shop_not_ready` — order/package not packed yet at arrival
- `item_damaged_at_shop` — damage observed before the driver took custody
- `wrong_item_packed` — barcode/contents mismatch against the manifest
- `shop_closed_or_inaccessible` — driver could not physically reach the shop
- `other` (free text required)

**Hub check-in exceptions** (`checkin_exception_reason`):
- `missing_from_run` — a package scanned at pickup is not present at check-in (highest-severity — implies
  loss/theft in transit)
- `unexpected_extra` — a package present that wasn't on this driver's expected manifest (possible
  mis-scan or misrouted item)
- `damaged_in_transit` — package condition changed between pickup and hub
- `misrouted_split` — a package flagged same-day at checkout physically doesn't match a same-day slot (or
  vice versa) — should be very rare given sortation is decided at checkout, but must be representable
- `other` (free text required)

**Customer delivery exceptions** (`delivery_exception_reason`) — this is the one the brief explicitly
scoped as existing before ("nobody_home | wrong_address | customer_refused | access_blocked | other"); I'd
extend it slightly based on what carrier taxonomies consistently include
**[the specific taxonomy below is a synthesis from general industry pattern knowledge across
Australia Post/DHL/UPS/FedEx/Onfleet/Shipday reason-code conventions — I was not able to pull a live,
itemised reason-code list from any single carrier's API docs this session because the direct fetches to
DHL, Shipday, and Australia Post's failed-delivery pages all returned 404/timeout; treat this list as a
reasonable, defensible synthesis, not a verified quote from any one source]**:
- `nobody_home` — no answer at attended address, no safe ATL option available/chosen
- `wrong_address` — address doesn't exist / driver cannot locate it
- `customer_refused` — recipient declined the delivery (wrong order, changed mind, damaged on arrival)
- `access_blocked` — locked building, gated community, no buzzer response, no safe pedestrian access
- `unsafe_environment` — driver safety concern (aggressive dog, hostile occupant, unsafe area) — worth
  separating from `access_blocked` because it's a driver-welfare signal that should route differently
  operationally (e.g., flag the address, don't just retry blindly)
- `age_verification_failed` — restricted item, recipient could not/would not prove age (future-proofing
  for §3a; unused today)
- `recipient_intoxicated` — restricted-item refusal specific to alcohol law (future-proofing; unused
  today)
- `shortfall_at_hub` — the delivery cannot proceed because the package never arrived at the hub (this is a
  *delivery*-stage symptom of a *hub check-in*-stage problem — worth being able to trace back to the
  `missing_from_run` event that caused it, not just record it as a dead end)
- `other` (free text required)

**Downstream handling** (synthesized best practice, not vendor-specific): a failed delivery should (a)
notify the customer with the specific reason, not a generic "delivery failed," (b) offer a concrete next
step (reschedule / redirect to a safe-drop alternative / contact support), and (c) **not silently retry
indefinitely** — carrier practice generally caps re-attempts at a small number (commonly cited as around
2–3 attempts before return-to-depot in general carrier practice) before the parcel returns to depot/hub for
customer collection or reschedule. **[UNVERIFIED THIS SESSION for the specific Australian-market number —
I could not pull Australia Post's own missed-delivery page this session (404 on direct fetch); recommend
confirming the exact re-attempt count Effy wants operationally rather than treating "2–3" as gospel.]**

---

## §5. Requirement catalogue (60+, tagged)

**Proof capture — shop pickup**
1. `ESSENTIAL` — Barcode/QR scan of every package at pickup against the shop's expected manifest.
2. `ESSENTIAL` — Hard block on advancing the run if scanned count < expected count, without an explicit
   exception reason.
3. `ESSENTIAL` — Shop-side "confirm handover" acknowledgement in the shop console (their side of the
   reconciliation).
4. `USEFUL` — Photo of a damaged item at pickup, attached to the exception record.
5. `USEFUL` — Driver free-text note on any pickup exception.
6. `OVERKILL-AT-OUR-SCALE` — Per-item photo of every package at every pickup (fewer than 10 drivers, one
   hub — the failure mode this guards against is rare and the reconciliation scan already catches the
   count mismatch).
7. `OVERKILL-AT-OUR-SCALE` — Physical seal numbers on collection totes (this is a parcel-network-scale
   control for anonymous third-party handoffs; Effy's shops are its own fulfilment nodes, not
   arms-length counterparties).
8. `USEFUL` — GPS stamp of the pickup scan event (cheap to capture, useful for later dispute resolution
   and for the anti-fraud posture in §10).
9. `ESSENTIAL` — Timestamp (device + server-received) on every scan event.

**Proof capture — hub check-in**
10. `ESSENTIAL` — Scan-in of every collected package against the driver's own collection manifest.
11. `ESSENTIAL` — Hard exception flow for `missing_from_run` (see §4) — this is the single highest-value
    control point on the whole platform for custody loss.
12. `ESSENTIAL` — Same-day/standard split confirmation surfaced from the checkout-time decision (per
    CLAUDE.md 049: "the hub check-in surfaces the split; the driver does not classify anything") — i.e.
    this is a read, not a capture, but it must be represented as part of the check-in event record.
13. `ESSENTIAL` — Record of which packages were physically handed to the third-party carrier vs retained
    for the same-day round, with timestamp.
14. `USEFUL` — Photo of any package flagged `damaged_in_transit`.
15. `USEFUL` — A single "batch confirm" driver gesture once all scans reconcile cleanly (fast UX; see §9).
16. `OVERKILL-AT-OUR-SCALE` — Individual sign-off per package at hub check-in (batch reconciliation with
    exception-only intervention is the right shape for a single-hub, <10-driver operation).
17. `USEFUL` — A hub-side operator view showing today's expected-vs-arrived counts in real time (an
    internal ops tool, not a driver-app feature).

**Proof capture — customer delivery**
18. `ESSENTIAL` — One-time delivery PIN/code as the default attended-handoff proof.
19. `ESSENTIAL` — Photo-at-location as the proof for any authorised contactless/ATL drop.
20. `ESSENTIAL` — GPS geofence check against the order's delivery address at the moment of capture.
21. `ESSENTIAL` — Timestamp (device + server-received).
22. `ESSENTIAL` — A genuine "delivery failed" path with a structured reason code (§4), distinct from
    "delivered."
23. `USEFUL` — Signature capture as a fallback proof method when a PIN can't be used (e.g. customer lost
    the code, or a household member without the code is accepting).
24. `USEFUL` — Recipient name field (typed/selected), paired with signature or PIN.
25. `USEFUL` — Driver free-text note field on every delivery event, always available not just on failure.
26. `USEFUL` — A checkout-time "leave at door" authorisation preference the driver's app surfaces on
    arrival, with the driver retaining final override (copy Australia Post's model exactly — §2c).
27. `USEFUL` — Per-address "safe place" free-text instruction, settable by the customer.
28. `OVERKILL-AT-OUR-SCALE` — Barcode/QR scan of the order at the customer's door (nothing for the
    customer-facing side to scan against; the code/PIN already proves order identity).
29. `OVERKILL-AT-OUR-SCALE` — Per-item photo of unpacked groceries on the doorstep.
30. `OVERKILL-AT-OUR-SCALE` — NFC/RFID tap-based handoff (no reader infrastructure on the customer side;
    solves a problem Effy doesn't have at this scale).
31. `USEFUL` — Photo of the package **before** it's left, in addition to at-location, for the small subset
    of contactless drops that are later disputed (i.e., always capture at-location; don't build a second
    "before" photo unless a specific dispute pattern emerges).

**Age-restricted goods (future-proofing only — currently out of scope)**
32. `ESSENTIAL` (if/when alcohol ships) — A `restricted_category`/`requires_attended_handoff` flag on the
    package/line, forcing attended-only delivery and disabling ATL for that package.
33. `ESSENTIAL` (if/when alcohol ships) — A mandatory age/ID-sighted confirmation gate before the delivery
    for that line can complete.
34. `ESSENTIAL` (if/when alcohol ships) — Structured refusal outcomes `age_verification_failed` /
    `recipient_intoxicated` (§4) that do not silently resolve to "delivered."
35. `USEFUL` (if/when alcohol ships) — A record of the **method** of age verification (e.g. "sighted
    driver licence") without storing a copy/photo of the ID document itself.
36. `OVERKILL-AT-OUR-SCALE` (today) — Any of the above built now, before Effy sells a single restricted
    item — build the schema hook (32) now, defer the rest.

**Exception/failure handling**
37. `ESSENTIAL` — Distinct reason-code enums per custody event (§4), not one shared enum across all three.
38. `ESSENTIAL` — Customer notification carrying the specific failure reason, not a generic message.
39. `USEFUL` — A capped re-attempt count with an explicit "return to hub" terminal state, rather than
    unbounded retry.
40. `USEFUL` — A driver-welfare-specific reason (`unsafe_environment`) that routes to an ops
    review/address-flag rather than being treated as an ordinary retry candidate.
41. `USEFUL` — Traceability from a delivery-stage `shortfall_at_hub` exception back to the originating
    hub check-in exception record (don't let the same underlying event get typed twice, unrelated).

**Evidence integrity & retention**
42. `ESSENTIAL` — POD media stored in private object storage (already the plan — private S3, presigned
    PUT/GET) with **no public read access ever**, per the platform's stated architecture.
43. `ESSENTIAL` — A documented, bounded retention period for POD photos, chosen to match a legitimate
    purpose (dispute resolution window) rather than "keep forever" — required in substance by APP 11.2
    even though OAIC sets no specific number (§3c).
44. `ESSENTIAL` — Access to the POD media bucket restricted to the systems/roles that need it (support
    handling a dispute, not "anyone with an S3 console login").
45. `USEFUL` — A hash of each POD media object recorded at upload time, to detect later tampering/
    substitution (cheap integrity signal; doesn't require a blockchain or anything exotic — just store
    the hash alongside the row).
46. `USEFUL` — An append-only event log per package (this is already Effy's established pattern per
    CLAUDE.md — `fulfillment_event` / `driver_task_event` style tables) recording every custody-relevant
    action, not just the terminal proof artifact.
47. `OVERKILL-AT-OUR-SCALE` — Cryptographic chain-of-custody (blockchain-style hash-linking of events) —
    a hashed-and-logged audit trail is sufficient for a single-hub, sub-10-driver operation; this is
    enterprise/regulated-goods territory Effy doesn't need.
48. `USEFUL` — A clear internal policy statement (even a short one) on what counts as "no longer needed"
    for APP 11.2 purposes, so retention isn't ad hoc.

**Legal/compliance-adjacent**
49. `ESSENTIAL` — Design the schema so a captured signature/PIN event records *what method* was used and
    *when*, sufficient to demonstrate the ETA 1999's identify/intent/reliable-method/consent elements if
    ever challenged (§3d).
50. `ESSENTIAL` — A documented internal position on food-safety transport controls (time-in-transit ceiling
    at minimum) even though the exact legal floor for last-mile grocery specifically could not be nailed
    down this session (§3b) — get this confirmed with proper food-safety advice, don't ship on my
    synthesis alone.
51. `USEFUL` — A driver-app checklist item confirming insulated bags/totes were used and sealed at
    handover, as a lightweight, auditable proxy for temperature control without requiring hardware.
52. `OVERKILL-AT-OUR-SCALE` — In-vehicle continuous temperature data loggers with API integration —
    plausible later if Effy scales into a heavier frozen/chilled assortment, not justified for the
    current grocery mix and driver count.

**Driver UX**
53. `ESSENTIAL` — Photo capture with a live camera preview and single-tap shutter — no multi-screen
    navigation to reach the camera.
54. `ESSENTIAL` — Auto-advance to the next required proof step (e.g. photo → automatically prompt PIN
    entry) rather than requiring the driver to navigate back to a menu.
55. `ESSENTIAL` — Offline capture with deferred upload and background sync — Track-POD explicitly ships
    "capture signatures and photos without signal; data syncs automatically once back online"
    [track-pod.com search result] — this is standard expectation, not a nice-to-have, for a mobile
    delivery workforce.
56. `ESSENTIAL` — Client-side image compression before upload (keeps sync fast on poor mobile connections
    and keeps S3/bandwidth costs sane at scale).
57. `USEFUL` — A "mark all remaining items unavailable/skip" bulk action at hub check-in for the rare
    clean-reconciliation case, to minimise taps (mirrors item 15).
58. `USEFUL` — Large touch targets sized for outdoor/gloved/rain use (a UX concern the codebase's own
    CLAUDE.md flags repeatedly for other features — "fat-finger targets" is an explicit platform
    requirement for mobile).
59. `OVERKILL-AT-OUR-SCALE` — A fully custom camera pipeline with manual exposure/focus controls — the
    OS-native camera intent/API is sufficient; building a bespoke capture UI is effort better spent
    elsewhere.

**Anti-fraud**
60. `ESSENTIAL` — GPS-distance-from-expected-address check at every proof-capture event, flagged (not
    necessarily blocked) if outside a reasonable radius.
61. `ESSENTIAL` — Server-received timestamp recorded independently of the device-reported timestamp, so a
    manipulated device clock doesn't silently become the system-of-record time.
62. `USEFUL` — Minimum time-at-stop heuristic (a delivery marked complete 2 seconds after the previous one,
    kilometres away, is worth flagging) — this is the general pattern behind sequence-anomaly detection
    used across last-mile fleets. **[This specific mechanism is described generically across the industry;
    I was not able to pull a specific Amazon/Uber/DoorDash public document confirming their exact
    implementation this session — treat as a recommended best practice, not a verified vendor citation.]**
63. `OVERKILL-AT-OUR-SCALE` — Full EXIF/photo-forensics tamper analysis pipeline — reasonable for a
    platform processing millions of PODs; not proportionate to Effy's phase-1 driver count. A simple
    GPS+timestamp+sequence check catches the overwhelming majority of realistic fraud at this scale.
64. `USEFUL` — An internal dashboard surfacing drivers/addresses with unusually high exception or
    fast-complete rates, for a human to review — cheap to build once the event log (46) exists, high
    value for catching both fraud and genuinely bad addresses.

---

## §6. Recommendation for Effy

**Media storage & retention**
- Keep the stated architecture (private S3, presigned PUT/GET) — it's already correct. Add: bucket access
  scoped tightly (item 44), a per-object content hash recorded at upload (item 45), and a **written**
  retention policy — recommend something in the range of the platform's own standard dispute/chargeback
  window (commonly discussed as up to ~120 days for payment disputes in general e-commerce practice, but
  **Effy should set this from its own payment provider's chargeback window and its own returns policy, not
  from a number I'm inventing here** — I could not find an OAIC-mandated number because none exists;
  "reasonable" is fact-specific per APP 11.2, §3c). After that window, delete or de-identify — don't keep
  POD photos indefinitely by default.

**Privacy posture**
- Treat every delivery photo as personal information by default (§3c) — no exceptions carved out just
  because it "looks like just a doorstep."
- Never store a photographed ID document for age verification (§3a) — record only that verification
  happened, by what method, by whom.
- Support Amazon's "confidential address" pattern if Effy ever needs it (e.g., a customer flags their
  address as sensitive) — suppress photo capture/display for that account, fall back to
  PIN-only proof.

**Driver-side UX flow (target tap counts, by custody event)**

*Shop pickup* — per shop, not per item:
1. Open shop stop → camera/scanner auto-opens (0 extra taps to reach scanner)
2. Scan each package (1 tap/scan, or continuous-scan mode if the barcode reader supports it)
3. App auto-reconciles against expected manifest; if clean → **1 tap** "Confirm handover & depart"
4. If short/mismatched → forced exception reason selection (2–3 taps: reason, optional photo, optional
   note) before the stop can close.
**Target: ~1–2 taps per package scanned + 1 tap to close a clean stop.**

*Hub check-in* — per run, not per package:
1. Arrive at hub → check-in mode auto-opens
2. Scan each package back in (1 tap/scan)
3. Clean reconciliation → **1 tap** "Confirm check-in, hand off standard packages"
4. Any discrepancy → forced exception flow per package (mirrors pickup: reason + optional photo/note)
**Target: ~1 tap per package + 1 tap to close a clean check-in.**

*Customer delivery* — per stop:
1. Arrive at drop → delivery screen auto-opens with the customer's ATL preference (if any) shown
   up-front, so the driver doesn't have to hunt for it
2. If attended: **1 tap** to open PIN entry, driver reads code from customer or asks them to state it,
   enter/confirm (auto-advances on 4th/6th digit) → **1 tap** "Complete"
3. If contactless (pre-authorised only): **1 tap** to open camera, shutter (**1 tap**), auto-advances to
   "Complete" (**1 tap** confirm) — camera should auto-open with no menu navigation, matching the pattern
   every reviewed vendor (Onfleet, Detrack, Track-POD) converges on.
4. If failed: **1 tap** "Can't deliver" → reason selection (1 tap) → optional note/photo → **1 tap**
   confirm.
**Target: ~2–3 taps for a clean attended or contactless delivery; offline capture with background sync
mandatory (item 55) since Melbourne suburban mobile coverage is not universally reliable and a driver
cannot be blocked from completing a round by a dead zone.**

**Schema shape (aligned to Effy's existing conventions — append-only event tables, per CLAUDE.md's own
described patterns for `fulfillment_event`/`driver_task_event`):**
- One append-only custody-event table per event type (or a single polymorphic one, matching whatever
  convention 049/056 already established — not researched here, defer to the existing codebase pattern),
  each row carrying: event type, custody stage (pickup/hub/delivery), package/order reference, driver,
  timestamp (device + server), GPS coordinates, proof method, a reference to the S3 object (if any,
  private key only, never a public URL), and — for exceptions — the structured reason code plus free text.
- Restricted-category flag (item 32) added now as a nullable/unused column, not retrofitted later.

---

## §7. Sources

Directly fetched/verified this session:
- Onfleet: [Proof of Delivery blog](https://onfleet.com/blog/proof-of-delivery/), [Proof of Delivery product page](https://onfleet.com/proof-of-delivery), [Support Center POD article](https://support.onfleet.com/hc/en-us/articles/10348848090644-Proof-of-Delivery), [Capturing Barcodes with Onfleet](https://onfleet.com/blog/capturing-barcodes-with-onfleet/), [5 Best POD Apps for Couriers 2026](https://onfleet.com/blog/proof-of-delivery-apps-couriers/)
- Detrack: [Deep Dive into Detrack's ePOD Features](https://www.detrack.com/blog/a-deep-dive-into-detracks-electronic-proof-of-delivery-features/), [What is Proof of Delivery](https://www.detrack.com/blog/what-is-proof-of-delivery/), [Customize POD Submission Settings](https://help.detrack.com/en/articles/6553234-how-to-customize-your-proof-of-delivery-pod-submission-settings), [How to Capture Photo Proof](https://help.detrack.com/en/articles/6553276-how-to-capture-photo-proof-for-delivery)
- Track-POD (search-engine result only; direct page fetch returned 404): [track-pod.com](https://www.track-pod.com/)
- Bringg: [Proof of Delivery blog](https://www.bringg.com/blog/logistics/proof-of-delivery/)
- Australia Post: [What is a Safe Drop](https://auspost.com.au/business/business-ideas/ecommerce-jargon-busters/what-is-a-safe-drop), [What is Authority to Leave](https://auspost.com.au/business/business-ideas/ecommerce-jargon-busters/what-is-authority-to-leave), [ATL flyer PDF](https://auspost.com.au/content/dam/auspost_corp/media/documents/authority-to-leave-flyer.pdf), [Signature on Delivery changes PDF](https://auspost.com.au/content/dam/auspost_corp/media/documents/changes-to-signature-on-delivery-service-eparcel-fact-sheet.pdf)
- Amazon: [Photo on Delivery help page](https://www.amazon.com/gp/help/customer/display.html?nodeId=GEE76GMYKN4HEYLK)
- FSANZ: [Receiving Food Safely fact sheet](https://www.foodstandards.gov.au/business/safety/factsheets/receivingfoodsafely), [Temperature control requirements](https://www.foodstandards.gov.au/business/safety/factsheets/codestandardst857)
- Victorian Health (Food Act 1984): [health.vic.gov.au/food-safety/the-food-act-1984](https://www.health.vic.gov.au/food-safety/the-food-act-1984)
- OAIC: [Chapter 11 – APP 11 Security of Personal Information](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information), [Photos and videos](https://www.oaic.gov.au/privacy/your-privacy-rights/social-media-and-online-privacy/photos-and-videos)

Retrieved via WebSearch synthesis only (primary source fetch blocked/failed this session — treat with
correspondingly lower confidence, especially on exact section numbers):
- VCGLR: [Supplying or delivering takeaway liquor: do the right thing](https://www.vcglr.vic.gov.au/news/supplying-or-delivering-takeaway-liquor-do-right-thing) (direct fetch returned `523`), [Changes to the Liquor Control Reform Act 1998](https://www.vcglr.vic.gov.au/changes-liquor-control-reform-act-1998) (direct fetch returned `523`)
- Liquor Control Reform Act 1998 (Vic): [legislation.vic.gov.au/in-force/acts/liquor-control-reform-act-1998](https://www.legislation.vic.gov.au/in-force/acts/liquor-control-reform-act-1998) (direct fetch returned version-history table only, not section text), [AustLII consolidated act](https://classic.austlii.edu.au/au/legis/vic/consol_act/lcra1998266/) (direct fetch returned `403`)
- Electronic Transactions Act 1999 (Cth): [AustLII](https://www5.austlii.edu.au/au/legis/cth/num_act/eta1999256/index.html) (direct fetch returned `403`), [legislation.gov.au](https://www.legislation.gov.au/C2004A00553/latest/text) (direct fetch returned table-of-contents only, not section 10 text), corroborating summaries: [DocuSign AU whitepaper](https://www.docusign.com/sites/default/files/au_white_paper_-_the_legality_of_electronic_signature.pdf), [OneSpan Australia eSignature legality guide](https://www.onespan.com/resources/esignature-legality/australia), [Attorney-General's Department](https://www.ag.gov.au/legal-system/electronic-signatures-documents-and-transactions)

Fetch attempts that failed entirely this session (403/404/523/timeout) — listed so a follow-up pass knows
what still needs verification: DHL delivery-exception page, Shipday POD blog, Australia Post missed-delivery
page, ShipHero inbound-receiving page, Detrack WMS blog, Woolworths alcohol-delivery help page, Coles liquor
delivery page, DoorDash alcohol FAQ, Uber Eats AU alcohol-delivery page, Uber Developer proof-of-delivery
docs, Instacart help center, AustLII LCRA section text, legislation.vic.gov.au Food Act 1984 full text.

**Web search quota**: exhausted at 200 calls (session-wide, shared) after ~12 queries used by this task;
remainder of research relied on WebFetch only, with the failure rate documented above.
