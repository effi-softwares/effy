# Feature Specification: Platform Domain & Per-Environment Namespaces

**Feature Branch**: `010-domain-dns-foundation`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "next i think we need to try to attach the domain effyshopping.com (brought from godaddy) to the hostedzone in sydney and atach that to the api gateway and other places. first of all we have effyshopping.com, this will be used in prodcution enviorment but still it is not deployed. so we can have it as primary domain and then we need to delegate dev.effyshopping.com domain to set for all the dev enviorment resources. (for qa and staging we should do the same thing in future)"

> Technology-specific directives from the description (registrar, DNS service, certificate and
> gateway attachment, region) are recorded verbatim in
> [operator-directives.md](./operator-directives.md) as **plan-phase input** — this spec stays free
> of implementation detail per constitution Principle I.

## Why this slice exists

The platform currently has **no name of its own**. Every address it exposes is a
provider-generated identifier: the one public endpoint in existence — the shared API the
back-office and shop consoles call — answers on an opaque, machine-assigned hostname that is
pasted into each client's configuration by hand. Three consequences follow, and they compound:

1. **The address is not stable.** It is an artifact of the provider's resource, not a platform
   asset. If that resource is ever recreated — as it was during the recent region relocation — the
   address changes and every client that hard-codes it breaks.
2. **Sign-in email is capped and unbranded.** Passwordless one-time-code email is the **only** way
   anybody signs in to this platform, on all four audiences. Without an owned, proven sending
   identity, that mail goes out from the identity provider's shared default sender under a low daily
   ceiling. Auth does not scale past a pilot until this is fixed.
3. **Environments have no boundary in the namespace.** There is nothing that says "this address is
   development" — so there is nothing structurally preventing a production client from being pointed
   at a development endpoint.

The platform owns `effyshopping.com`. This slice makes that ownership real: the platform becomes
the authority for its own namespace, each environment gets a **delegated child namespace** that is
self-contained, and the endpoints that exist today move onto stable, platform-owned, trusted
addresses. Production's namespace is **reserved but not deployed** — nothing is live there yet.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The platform is the authority for its own namespace (Priority: P1)

The operator takes control of `effyshopping.com` — bought from an external registrar — so that the
platform itself, from committed code, decides what every name under it resolves to. The
development environment is then given its **own delegated child namespace**
(`dev.effyshopping.com`) whose records are managed independently of the parent, so development can
create, change, and destroy its own addresses without any possibility of touching the production
namespace.

**Why this priority**: Nothing else in this slice is possible until the platform is authoritative
for the name. Delegation-per-environment is the structural decision that everything downstream
inherits; getting it right once means qa, staging, and production are later a repetition rather
than a redesign. This story alone — even with no endpoint attached yet — is independently valuable:
it converts a purchased domain into a platform-controlled asset.

**Independent Test**: From any machine on the public internet, a name lookup for the platform's
domain returns the platform's own name-servers (not the registrar's parking service), and a lookup
for the development child namespace returns the **development** namespace's name-servers — proving
the delegation is live and that dev is a separate authority.

**Acceptance Scenarios**:

1. **Given** the domain is registered with an external registrar and currently parked, **When** the
   operator points it at the platform's DNS authority, **Then** public lookups for the domain are
   answered by the platform's name-servers, and the platform's committed code is the only thing that
   creates records under it.
2. **Given** the platform is authoritative for the parent domain, **When** the development
   environment's namespace is provisioned, **Then** `dev.effyshopping.com` is a **separately
   managed** namespace and the parent publishes the delegation records that point to it.
3. **Given** the development namespace exists, **When** a record is created, changed, or removed
   inside it, **Then** no record in the parent namespace is modified as a side effect.
4. **Given** the production namespace is reserved, **When** the parent domain is looked up, **Then**
   it does not resolve to any development endpoint or serve any development content.

---

### User Story 2 - The development API answers on a stable, trusted, platform-owned address (Priority: P1)

The consoles stop calling an opaque provider-generated hostname and start calling a
platform-owned development address. The connection is trusted by browsers and clients with no
warnings, and the certificate proving the name renews itself without anyone remembering to do
anything.

**Why this priority**: This is the slice's first tangible payoff and the thing that removes a live
fragility — a hard-coded provider hostname that silently changes if the resource is recreated. It
is the proof that the namespace from US1 actually carries traffic.

**Independent Test**: Point a client at the platform-owned development address and issue the same
authenticated request it previously issued against the provider-generated address; the response is
identical, the connection is trusted, and no client configuration contains a provider-generated
hostname any more.

**Acceptance Scenarios**:

1. **Given** the development namespace exists, **When** a caller requests the platform's development
   API address over a secure connection, **Then** the request reaches the same API, returns the same
   response as the provider-generated address would, and the connection is trusted with no
   certificate warning.
2. **Given** the branded address is live, **When** the consoles are reconfigured to use it, **Then**
   sign-in and every existing authorized read/write behave exactly as before, with no change in
   behavior visible to the user.
3. **Given** callers may still hold the old address, **When** the branded address is introduced,
   **Then** the provider-generated address continues to work — the change is **additive**, and no
   caller is broken at the moment of cutover.
4. **Given** the certificate proving the branded name is nearing expiry, **When** no human
   intervenes, **Then** it renews automatically and the endpoint never becomes untrusted.
5. **Given** a browser-based console on a platform-owned address calls the platform-owned API
   address, **When** the request is made, **Then** cross-origin rules permit it — the new origin is
   recognized, not merely the local development origins.

---

### User Story 3 - Sign-in email comes from the platform, not the provider (Priority: P2)

One-time sign-in codes — the only credential this platform issues, for customers, drivers, shop
operators, and back-office staff alike — arrive from a no-reply address **at the sending
environment's own namespace** (`no-reply@dev.effyshopping.com` in development), are provably
authorized by the domain owner, and are no longer subject to the identity provider's low default
daily sending ceiling. Because each environment sends as its own namespace, development mail can
never spend the production domain's sending reputation.

**Why this priority**: This is the highest *functional* payoff of owning the domain, and it is
currently a hard ceiling on the product: the identity provider's built-in sender caps daily
delivery at a level suitable only for a pilot, and mail arrives from a generic third-party address
that looks like phishing to a real customer. Every audience's sign-in depends on this. It is P2
rather than P1 only because it is independently deliverable **after** the namespace exists, and the
namespace is the prerequisite.

**Independent Test**: Request a sign-in code on any surface; the mail arrives from
`no-reply@dev.effyshopping.com`, passes the receiving mail system's domain-authorization checks, and
lands in the inbox rather than the spam folder. Sending volume above the provider's built-in default
ceiling succeeds.

**Acceptance Scenarios**:

1. **Given** the platform is authoritative for its domain, **When** the development environment's
   sending identity is established, **Then** the **development namespace** publishes the records that
   authorize the platform to send mail as `dev.effyshopping.com`, and receiving mail systems validate
   them.
2. **Given** the sending identity is established, **When** a user on any of the four audiences
   requests a sign-in code, **Then** the mail is sent from the no-reply address at that environment's
   namespace — not the identity provider's default sender, and not the production apex.
3. **Given** sign-in email is being sent from the platform's identity, **When** daily volume exceeds
   the identity provider's built-in default ceiling, **Then** delivery continues to succeed.
4. **Given** the sending identity is newly created and therefore restricted to pre-approved
   recipients, **When** the operator attempts to send to an unapproved recipient, **Then** the
   restriction is visible and understood as a known state to be lifted before real users are onboarded
   — it does not silently drop mail.
5. **Given** the platform can send from an address, **When** a user replies to that address, **Then**
   they are not led to believe anyone is listening — no human-reachable contact address is advertised
   until inbound mail exists to serve it.

---

### User Story 4 - A new environment is a repetition, not a redesign (Priority: P3)

When qa, staging, and eventually production are stood up, each gets its own delegated child
namespace and its own addresses by supplying the environment's name — reusing the identical
structure development proved, with no new design work and no edit to any other environment.

**Why this priority**: The user explicitly asked for this ("for qa and staging we should do the
same thing in future"). It costs almost nothing to guarantee *now* — while there is exactly one
environment and the pattern is still soft — and is expensive to retrofit later once three
environments have each drifted into a bespoke shape.

**Independent Test**: Without writing any new design, add a second environment namespace by
supplying only its name; it is delegated, isolated, and addressable exactly as development is, and
the development namespace is not touched.

**Acceptance Scenarios**:

1. **Given** the development namespace pattern exists, **When** a new environment is introduced by
   name alone, **Then** it receives a delegated child namespace and an equivalent set of addresses
   with no structural change to the platform's code.
2. **Given** multiple environment namespaces exist, **When** any one of them is changed or removed,
   **Then** no other environment's addresses are affected.
3. **Given** an environment's addresses are published, **When** any part of the platform needs to know
   an environment's address, **Then** it obtains it from the platform's published configuration rather
   than from a value typed in by hand.

---

### Edge Cases

- **Delegation not yet propagated.** The registrar's change of authority is not instant. What does a
  client see while the world still believes the old authority? The cutover must be additive (the
  previous address keeps working) so that propagation lag is never an outage.
- **Certificate not yet validated.** A trusted name requires proof of control, which takes time. The
  branded address must not be published to clients in a half-configured state where it resolves but
  is not yet trusted.
- **Dangling delegation (namespace takeover).** If a child namespace is destroyed but the parent
  keeps publishing delegation records pointing at it, the name can be claimed by a third party. Tearing
  an environment down must remove the parent's delegation records in the same operation.
- **A caller still on the old address.** Some client, script, or saved configuration will still hold
  the provider-generated hostname. It must keep working; it must not be assumed dead just because the
  known clients were updated.
- **The apex is not deployed.** Production has nothing running. The parent name must not accidentally
  resolve to a development endpoint, and must not present as a live product.
- **Restricted sending on a new mail identity.** A newly established sending identity is typically
  limited to pre-approved recipients. Sign-in mail to anyone else will not arrive — this must be a
  known, surfaced state, not a silent failure discovered by a user who never gets their code.
- **The registrar is a third party.** Control of the name ultimately rests on registrar credentials
  outside the platform's code. Loss of that account is loss of the namespace.
- **Recreating an endpoint behind a stable name.** The whole point is that the underlying resource can
  be replaced; the name must survive the replacement and repoint, with no client change.

## Requirements *(mandatory)*

### Functional Requirements

**Namespace authority & delegation**

- **FR-001**: The platform MUST be the authoritative source for `effyshopping.com`, with the external
  registrar delegating authority to it.
- **FR-002**: Every record under the platform's domain MUST be created from committed code; no record
  may be created by hand in a provider console as a normal practice.
- **FR-003**: Each environment MUST have its own **delegated child namespace** under the platform
  domain, named for the environment (development = `dev.effyshopping.com`).
- **FR-004**: An environment's child namespace MUST be independently managed, such that creating,
  changing, or destroying any record within it modifies no record belonging to another environment or
  to the parent — except the parent's delegation record for that environment itself.
- **FR-005**: Destroying an environment's namespace MUST also remove the parent's delegation records
  that point to it, leaving no dangling delegation.
- **FR-006**: The parent (production) namespace MUST be reserved and MUST NOT resolve to any
  non-production endpoint or serve any non-production content.
- **FR-007**: Introducing a further environment (qa, staging, production) MUST require supplying only
  the environment's name — no new structural design and no modification of an existing environment.

**Addresses for endpoints**

- **FR-008**: The shared API of each environment MUST be reachable at a stable, platform-owned address
  within that environment's namespace.
- **FR-009**: Every platform-owned address serving traffic MUST be reachable only over a secure,
  trusted connection, with a certificate that clients accept without warning.
- **FR-010**: Certificates proving platform-owned names MUST renew without human intervention and MUST
  NOT be capable of causing an expiry-driven outage.
- **FR-011**: Introducing a platform-owned address MUST be **additive**: the provider-generated address
  it replaces MUST continue to function, so that no existing caller breaks at cutover.
- **FR-012**: A platform-owned address MUST survive replacement of the resource behind it — the
  underlying endpoint can be destroyed and recreated and the address repoints to it, with no client
  change.
- **FR-013**: Browser-based surfaces served from a platform-owned address MUST be permitted to call the
  platform-owned API address; the platform-owned origins MUST be recognized alongside the existing
  local development origins.
- **FR-014**: Clients MUST obtain an environment's addresses from the platform's published
  configuration contract, not from hand-copied values. No client configuration may contain a
  provider-generated hostname once its platform-owned equivalent exists.
- **FR-015**: The naming convention for every environment's addresses MUST be defined once, in one
  place, and applied uniformly — so an address is derivable from (environment, endpoint) rather than
  invented per case.
- **FR-016**: This slice MUST attach a platform-owned address to exactly the endpoints that exist
  today — which is **one**: the shared API. Endpoints that do not yet exist (the hosted consoles, the
  customer storefront, the latency-sensitive backend) MUST have their names **reserved by the
  convention** (FR-015) but MUST NOT be created here. Each is attached by the slice that deploys it,
  reusing this convention without redesigning it.

**Sign-in email identity**

- **FR-017**: The platform MUST establish a **proven sending identity** for its domain, published as
  records in the platform's namespace, such that receiving mail systems can verify the platform is
  authorized to send as the domain.
- **FR-018**: The sending identity MUST be scoped **per environment**, matching the namespace
  isolation of FR-003: the development environment sends as `dev.effyshopping.com` (e.g.
  `no-reply@dev.effyshopping.com`), and its authorizing records live in the development namespace. The
  apex identity is **reserved for production** and MUST NOT be used to send development mail.
- **FR-019**: One-time sign-in codes for all four audiences MUST be sent from a **no-reply** address at
  the environment's own namespace, rather than from the identity provider's shared default sender.
- **FR-020**: Sign-in email delivery MUST NOT be constrained by the identity provider's built-in
  default daily ceiling.
- **FR-021**: Any recipient restriction on a newly created sending identity MUST be surfaced explicitly
  as a known state with a defined path to lifting it — sign-in mail MUST NOT fail silently.
- **FR-022**: An address the platform sends **from** MUST NOT imply the platform can receive **at** it.
  Any human-reachable address (e.g. a `hello@` contact address) MUST NOT be advertised to users until
  inbound mail exists to serve it; until then, only the no-reply sender is used. A reply that would
  silently bounce is worse than no address at all.

**Cost & governance**

- **FR-023**: The recurring cost added by this slice MUST be bounded and stated, consistent with the
  platform's minimal-spend posture in its early weeks.
- **FR-024**: Registrar-held control of the domain MUST be documented as an out-of-code dependency,
  alongside the existing hand-maintained, region-pinned values.

### Key Entities

- **Platform domain**: the registered name the platform owns (`effyshopping.com`). Held at an external
  registrar; authority delegated to the platform. Reserved for production.
- **Environment namespace**: a delegated child of the platform domain, one per environment
  (`dev.`, later `qa.`, `staging.`, and the parent itself for production). The unit of isolation — an
  environment may only write inside its own.
- **Endpoint address**: a name within an environment namespace that points at one of that
  environment's endpoints. Stable across replacement of the thing it points at.
- **Delegation record**: the parent's published pointer to a child namespace's authority. Must be
  created and destroyed in lockstep with the child.
- **Trust certificate**: proof of control of a name, enabling secure connections. Must auto-renew.
- **Sending identity**: proof that the platform is authorized to send email as its domain, published as
  records in the namespace. Underpins all sign-in.
- **Address contract**: the platform's published, machine-readable source of each environment's
  addresses — what clients and services read instead of hard-coding.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any machine on the public internet, a lookup of the platform domain is answered by
  the platform's own authority, and a lookup of the development namespace is answered by the
  development namespace's own authority — proving delegation is live.
- **SC-002**: The development API answers at its platform-owned address over a trusted connection with
  **zero** certificate warnings, and returns byte-for-byte the same responses as the
  provider-generated address for the same authenticated requests.
- **SC-003**: **Zero** provider-generated hostnames remain in any client's configuration; every client
  reads its address from the published contract.
- **SC-004**: The provider-generated address still functions after cutover — **zero** callers broken.
- **SC-005**: An endpoint behind a platform-owned address can be destroyed and recreated with **zero**
  changes to any client, and the address resolves to the new resource.
- **SC-006**: Certificate renewal requires **zero** human actions, verified by inspecting that renewal
  is automatic and that no expiry date is tracked by a person.
- **SC-007**: A second environment namespace can be introduced by supplying only its name, in under
  **one working session**, with **zero** structural changes and **zero** edits to the development
  namespace.
- **SC-008**: Tearing down an environment leaves **zero** dangling delegation records in the parent.
- **SC-009**: The parent domain serves **no** development content and resolves to **no** development
  endpoint.
- **SC-010**: A sign-in code requested on any of the four audiences arrives from
  `no-reply@dev.effyshopping.com`, passes the receiving system's domain-authorization checks, and
  reaches the inbox rather than the spam folder — verified on at least one major consumer mail
  provider.
- **SC-011**: Sign-in email volume exceeds the identity provider's built-in default daily ceiling
  without delivery failure.
- **SC-014**: **Zero** development mail is sent from the production apex identity — development's
  sending reputation is fully contained in its own namespace.
- **SC-012**: The recurring cost added by this slice is measured and is **under USD 5/month** in the
  development environment.
- **SC-013**: Every out-of-code, hand-maintained value introduced by this slice is documented in the
  environment runbook alongside the existing region-pinned values.

## Assumptions

- **The registrar stays the registrar.** The domain remains registered at the external registrar
  (GoDaddy); only *authority* for the name is delegated to the platform. Transferring the registration
  itself is out of scope — it is slow, risky, and buys nothing this slice needs.
- **The parent domain is production's, and production is not deployed.** Nothing runs at the apex. This
  slice reserves it and proves the pattern in development; it does not stand production up.
- **The one public endpoint today is the shared API.** The web consoles are not hosted anywhere (they
  run locally), and the latency-sensitive backend has never been deployed. This slice therefore has
  exactly one endpoint to attach — the rest are named by convention and attached when they ship. The
  operator confirmed this ordering explicitly: the API now; the frontends when they are deployed; the
  latency-sensitive backend when it is deployed.
- **Sending identities are per-environment.** Development verifies and sends as its own namespace
  (`no-reply@dev.effyshopping.com`), keeping its sending reputation isolated from the production apex,
  exactly as its DNS records are. Production's apex identity is reserved, not used.
- **Only a no-reply sender is established.** A human-reachable contact address (`hello@…`) is not
  advertised in this slice, because the platform cannot yet *receive* mail — inbound is out of scope. A
  contact address arrives with the ability to answer it.
- **Cutover is additive, never a switch.** The provider-generated address is not withdrawn. This is what
  makes the change safe to make at any time, with no propagation-lag outage.
- **Development data is disposable.** Consistent with the platform's existing posture, a mistake in the
  development namespace is recoverable by rebuilding it.
- **Environment isolation is by namespace, not by account.** All environments live under one platform
  domain, separated by delegated child namespaces. A future multi-account split does not change this
  design.
- **No user-visible product change.** This slice changes addresses and mail identity; it adds no product
  capability that a customer, driver, shop operator, or staff member can see, other than sign-in mail
  that looks legitimate.

## Out of Scope

- Deploying anything new. No hosted consoles, no customer storefront, no latency-sensitive backend —
  this slice attaches names to what exists and reserves names for what does not. **Each of those gets
  its platform-owned address from the slice that deploys it**, reusing this slice's convention.
- Standing up the production environment.
- Transferring domain registration away from the external registrar.
- Content delivery, caching, edge distribution, or geographic routing.
- Vanity or marketing addresses, redirects, and landing pages at the apex.
- **Inbound email** (receiving mail at the domain). Only the *sending* identity is established — which
  is why no human-reachable contact address is advertised (FR-022).
- Multi-account or multi-region environment isolation.
