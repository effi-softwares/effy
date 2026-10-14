# Feature Specification: Catalogue Pictures That Load Once — Stable Addresses, Right-Sized

**Feature Branch**: `086-catalogue-image-delivery`

**Created**: 2026-10-14

**Status**: Draft

**Input**: "Fast, cacheable catalogue images on the customer storefront (backlog PERF-02 + PERF-03,
docs/customer-web-performance-backlog.md). Every public catalogue and promotion picture has ONE stable
address, delivered from near the shopper, kept by the browser for a long time; each picture is delivered
at roughly the size it is displayed and in a modern compact format, older pictures included; private
objects — courier labels, delivery proof — never get a public address; operator surfaces keep working."

**Builds on**: product pictures (016), promotion artwork (029), the customer storefront (011, 084) and
the customer app (013). It changes how a shopper's pictures are addressed and delivered — not which
pictures exist, who may upload them, or what any screen shows.

## The gap this closes

A shopper looking at Effy sees mostly pictures, and today every one of them is slower than it needs to
be, for two separate reasons:

1. **A picture's address is new on every page view and stops working after fifteen minutes.** The same
   product photo is therefore downloaded again on every visit, on every page, by every shopper — nothing
   the shopper's device has already fetched can be reused. It also means no page that shows a picture
   can itself be kept for later, which blocks the next round of speed work (the aisle list, the home
   page and the product page).
2. **The picture delivered is always the original upload.** A thumbnail the size of a postage stamp
   downloads the full photograph a shop uploaded — up to 10 MB — from a single location, however far
   away the shopper is.

Pictures that are **not** for shoppers — courier labels, proof-of-delivery photos — sit in the same
store and are protected today by the same short-lived links. Whatever opens catalogue pictures up must
leave those exactly as closed as they are.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shopper's pictures are downloaded once (Priority: P1)

A shopper browses the home page, opens an aisle, opens a product, goes back, and returns the next day.
Every catalogue and promotion picture they have already seen appears immediately, without being
downloaded again.

**Why this priority**: It is the largest single source of wasted loading on the storefront, it is felt
on every page, and the later caching work cannot start until a picture's address stops changing.

**Independent Test**: Load a page twice and compare: the same product shows the same picture address
both times, and the second view transfers no picture data.

**Acceptance Scenarios**:

1. **Given** a product with a picture, **When** its details are requested twice, minutes or days apart,
   **Then** both answers carry the identical picture address.
2. **Given** a shopper who has viewed a page, **When** they view it again, **Then** its catalogue and
   promotion pictures are shown from what their device already holds, with nothing re-downloaded.
3. **Given** a picture address obtained yesterday (a saved page, a shared link, an open tab), **When**
   it is used today, **Then** the picture still loads.
4. **Given** the same product, **When** it is shown on the website and in the customer app, **Then**
   both use the same picture address.
5. **Given** a shop replaces a product's picture, **When** a shopper next sees that product, **Then**
   they see the new picture — never the old one from their device's memory.

---

### User Story 2 - Private pictures and documents stay private (Priority: P1)

Courier labels and proof-of-delivery photos are kept alongside catalogue pictures. Making catalogue
pictures openly addressable must not make any of these reachable.

**Why this priority**: A label carries a customer's name and address; a proof photo shows their door.
Shipping Story 1 without this would be a privacy defect, so the two are delivered together.

**Independent Test**: Attempt to fetch a courier label and a proof photo through the public picture
address scheme; both are refused, while the people entitled to them still open them as today.

**Acceptance Scenarios**:

1. **Given** a courier label or a proof-of-delivery photo, **When** anyone requests it by a public
   picture address, **Then** it is refused.
2. **Given** staff, the entitled shop or the driver, **When** they open a label or a proof photo as
   they do today, **Then** it opens, through a link that expires shortly after. (Customers are not
   shown labels or proof photos today, and this feature does not change that.)
3. **Given** a future kind of stored object that is not declared public, **When** it is added, **Then**
   it is private without anyone having to remember to protect it.
4. **Given** a change that would hand a public address to a private object, **When** the platform's
   checks run, **Then** they fail before it can be released.

---

### User Story 3 - A picture is delivered at the size it is shown (Priority: P2)

A shopper on a phone scrolls a grid of products. Each small picture downloads as a small file in a
compact format, not as the original photograph.

**Why this priority**: Large, shopper-visible gain — but it rides on Story 1's stable addresses, and
Story 1 is valuable alone.

**Independent Test**: View a product grid on a phone-sized screen and inspect what was transferred for
one card: an image close to the card's displayed size, in a modern compact format.

**Acceptance Scenarios**:

1. **Given** a product card on a phone, **When** its picture loads, **Then** the file delivered is
   sized for the card, not the original upload.
2. **Given** the same picture on a product page's main gallery on a large screen, **When** it loads,
   **Then** a correspondingly larger version is delivered and it looks sharp.
3. **Given** a device that understands a modern compact picture format, **When** a picture loads,
   **Then** it is delivered in that format; a device that does not is given the original, which it
   can always show.
4. **Given** a picture uploaded before this feature, **When** it is shown, **Then** it is right-sized
   like any other.
5. **Given** a picture uploaded moments ago whose smaller versions are not ready, **When** it is shown,
   **Then** the shopper sees the picture anyway — never a broken or empty frame.

---

### User Story 4 - Shops and staff notice nothing (Priority: P2)

A shop operator uploads and reorders product pictures; staff create promotion artwork, review products
awaiting approval, and open courier labels. Everything works as before.

**Why this priority**: The change is aimed at shoppers; operator work must not regress.

**Independent Test**: Walk the picture-related operator tasks in the shop console, shop app and
back-office before and after; each completes identically.

**Acceptance Scenarios**:

1. **Given** a shop operator, **When** they upload, replace, reorder or remove a product picture,
   **Then** it works as today and the picture appears in their console straight away.
2. **Given** staff, **When** they upload promotion artwork or review a product's pictures, **Then** it
   works as today.
3. **Given** a picture that has just been uploaded, **When** the shopper-facing versions are still
   being prepared, **Then** the operator's own view is not held up.

### Edge Cases

- **A picture is removed** (product deleted, picture replaced): its old address may keep working for a
  while on devices and pages that already hold it; it must stop being *shown* immediately, because
  nothing references it. Whether the stored picture is later cleaned up is unchanged by this feature.
- **A product is hidden, unapproved or out of stock**: its pictures have addresses like any other.
  Those addresses are unguessable and are only ever given out with the product, so a hidden product's
  picture is not discoverable — but it is not secret from someone who was given the address earlier.
- **A picture's smaller versions could not be made** (corrupt or unusual file): the original is
  delivered instead and the failure is visible to whoever runs the platform, not to the shopper.
- **An installed customer app from before this feature** receives the new addresses in the same place
  as the old ones and must show them without an update.
- **An order placed earlier** shows its items' pictures from its history; those must keep loading.
- **Emails already sent** that contained a picture link from before this feature are not repaired
  (those links had already expired after fifteen minutes).
- **The delivery location nearest a shopper is unavailable**: the picture is still delivered, from
  elsewhere, more slowly.
- **Transparent pictures**: transparency is preserved in every version.
- **Animated pictures**: get no smaller versions; the original is delivered, so the animation is never
  reduced to its first frame.

## Requirements *(mandatory)*

### Functional Requirements

**Stable addresses**

- **FR-001**: Every catalogue picture (product pictures, and the pictures aisles borrow from them) and
  every piece of promotion artwork shown to a shopper MUST have exactly one address, which is the same
  on every request, for every shopper, signed in or not.
- **FR-002**: That address MUST NOT expire and MUST NOT contain anything that varies by time, request
  or person.
- **FR-003**: The customer website and the customer app MUST receive the same address for the same
  picture, everywhere a shopper sees it: listings, search, product pages, the home page and banners,
  the cart, checkout, saved items and lists, orders and receipts.
- **FR-004**: A shopper's device MUST be told it may keep a picture for at least a year without
  checking again.
- **FR-005**: A replaced picture MUST get a new address, so FR-004 can never show a shopper a stale
  picture.
- **FR-006**: Pictures MUST be delivered from a location near the shopper rather than from one place.
- **FR-007**: An installed customer app MUST keep showing pictures without being updated.

**Right-sized pictures**

- **FR-008**: Each public picture MUST be available in a small fixed set of sizes covering the smallest
  thumbnail to the largest gallery view, and each place the **customer website** shows a picture MUST
  ask for the size that fits it on the shopper's screen. (The customer app adopting sizes is a later
  change; until then it shows the original from its stable address — see Assumptions.)
- **FR-009**: Each size MUST be in a modern compact format. A device that cannot show that format MUST
  be given the original picture instead.
- **FR-010**: The sizes MUST be prepared ahead of time — a shopper's request never waits for a picture
  to be resized.
- **FR-011**: Pictures uploaded before this feature MUST be given the same sizes, in one pass that can
  be re-run safely and reports what it could not process.
- **FR-012**: When a size is not available — not ready yet, or could not be made — the shopper MUST
  be shown the original picture instead of a broken frame.
- **FR-013**: A prepared size MUST never be larger, in dimensions, than the original (no enlarging),
  and MUST keep its proportions and any transparency. A picture narrower than the largest size MUST
  also be prepared at its own width, so a large view of it is never an enlarged smaller size.

**Privacy**

- **FR-014**: Only catalogue pictures and promotion artwork may be publicly addressable. Everything
  else stored with them — courier labels, proof-of-delivery photos, and any kind added later — MUST be
  private by default and reachable only through links that expire shortly after being issued, to the
  people entitled today.
- **FR-015**: What counts as public MUST be stated in one place, and an automated check MUST fail any
  change that gives a public address to something outside it.
- **FR-016**: A request for a private object through the public address scheme MUST be refused, and
  the refusal MUST NOT reveal whether the object exists.
- **FR-017**: Public addresses MUST NOT allow listing or browsing what is stored — only fetching a
  picture whose address is already known.

**Operators and continuity**

- **FR-018**: Uploading, replacing, reordering and removing pictures in the shop console, the shop app
  and back-office MUST work as today, with the same accepted formats and size limit.
- **FR-019**: An operator MUST see a picture they have just uploaded immediately, without waiting for
  shopper-facing sizes.
- **FR-020**: Every failure to prepare a picture's sizes MUST be recorded and raise an alert to whoever
  runs the platform — a single failure is enough; it MUST NOT block the upload or hide the product.
- **FR-022**: Picture delivery is customer-facing: a rise in the rate at which pictures fail to be
  delivered MUST alert whoever runs the platform.
- **FR-021**: The change MUST be releasable without a moment in which shoppers see no pictures: old and
  new addresses both work while it rolls out.

### Key Entities

- **Public picture**: a catalogue picture or promotion artwork. Has one permanent address and a set of
  prepared sizes.
- **Prepared size**: a smaller version of a public picture at one of the fixed widths, in a compact
  format and a universal one. Belongs to exactly one picture; replaced with it.
- **Private object**: anything else kept in the same store (courier label, proof-of-delivery photo).
  Has no address; opened only by a short-lived link.
- **Public set**: the single statement of which kinds of object are public pictures.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The same product returns the identical picture address on two requests made a day apart,
  on the website and in the app.
- **SC-002**: A repeat view of the home page, an aisle page and a product page transfers zero bytes of
  catalogue or promotion pictures.
- **SC-003**: A product card on a phone downloads a picture no more than twice its displayed width, in
  a modern compact format; across the dev catalogue's card pictures the median such file is under 50 KB.
- **SC-004**: Total picture weight of a first-time view of the home page on a phone falls by at least
  80% against the baseline recorded before the change.
- **SC-005**: The time until the home page's largest picture is visible, on a throttled phone
  connection, improves by at least 30% against the same baseline.
- **SC-006**: 100% of attempts to fetch a courier label or proof-of-delivery photo by a public address
  are refused; 100% of entitled opens still succeed.
- **SC-007**: After the one-time pass, at least 99% of existing public pictures have every prepared
  size; the remainder are listed by name.
- **SC-008**: Every operator picture task (upload, replace, reorder, remove, open a label) completes
  exactly as before, with no added waiting.
- **SC-009**: No shopper sees a missing picture during or after the rollout that they would have seen
  before it.

## Assumptions

- **A known address is enough to fetch a public picture.** Catalogue pictures and promotion artwork are
  meant to be seen by anyone; their addresses are long and random, so they cannot be guessed, but they
  are not access-controlled. This includes pictures of products that are hidden or awaiting approval.
- **"Public" means product pictures and promotion artwork only** — the two kinds that exist today.
  Feedback, labels and proof photos are private.
- **Aisle (category) pictures are product pictures**, so they are covered without a separate rule.
- **The customer app shows the original picture** from its stable address in this feature (it gains
  the browser-cache-like benefit through its own image cache). Choosing a size in the app is a later
  change; installed apps must keep working either way.
- **Operator consoles may keep using short-lived links** for the pictures they manage; moving them to
  the public addresses is permitted but not required.
- **Accepted upload formats and the 10 MB limit do not change.**
- **Deleting stored pictures that nothing references** is not part of this feature.
- **Each environment has its own picture addresses**, under its own name; production's are not created
  here.
- **A baseline is recorded first** (backlog PERF-20) so SC-004 and SC-005 are measured, not estimated.
- **Out of scope**: keeping public data between requests (PERF-05..08), server-rendered search
  (PERF-09/10) and which picture loads first on a page (PERF-04) — the first of these depends on this
  feature.
