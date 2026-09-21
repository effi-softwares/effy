# Real-Time Work Delivery to the Driver Mobile App — Research Report

Scope: how Effy's driver app (KMP + Compose Multiplatform, Ktor client, Clean Architecture/MVVM,
Amplify/Cognito auth) should receive newly-assigned work in real time, against Effy's locked stack
(Node/TS Lambdas behind API Gateway HTTP API — 30s integration cap; Go/Gin on Fargate behind an ALB —
the only long-running process, already serving SSE via Postgres LISTEN/NOTIFY; FCM push, locked).
Scale: fewer than 10 concurrent driver devices, one hub, Melbourne.

⚠ **Research-budget note**: this session's web-search quota was exhausted partway through (11 searches
used before the hard cap). All facts below are either (a) sourced from a search result or a successfully
fetched primary-source page, cited inline, or (b) flagged explicitly as **UNVERIFIED THIS SESSION** where
a primary source could not be reached (mostly Apple's JS-rendered developer.apple.com pages, which
returned only page titles to the fetch tool) and the claim rests on well-established, widely-documented
platform behaviour that has not changed in recent OS/SDK cycles. Anything marked UNVERIFIED should be
spot-checked against the live Apple Developer docs before being treated as load-bearing for a compliance
or App Review decision.

---

## §1 Transport comparison table

| Transport | Battery impact | Backgrounded behaviour | Flaky-network behaviour | Reconnection | Server cost @ Effy scale | Works from KMP/Ktor? |
|---|---|---|---|---|---|---|
| **HTTP polling** (fixed interval GET) | Low-moderate; a timer wake every N seconds is cheap per-wake but the *aggregate* of always-on polling was Uber's stated cause of "faster battery drain" at fleet scale [Uber blog](https://www.uber.com/blog/real-time-push-platform/) | Continues if a background task/WorkManager job is allowed to run; throttled hard by Doze/App Standby on Android and by iOS background execution budgets | Degrades gracefully — a missed poll just means staleness until the next one; no connection state to lose | Trivial (no persistent connection to lose) | Near-zero at 10 devices even polling every 5–10s | Yes, trivially — any `HttpClient.get()` |
| **Long polling** (hold request open until data or timeout) | Better than tight polling but each held connection still costs a wake+radio cycle on reconnect | Same background constraints as polling; each "hold" is itself a network call the OS can defer | Needs a request timeout + immediate re-issue; every network blip forces a full reconnect+backoff cycle | Manual, on every timeout | Ties up one Lambda/Fargate worker per waiting client for the hold duration — cheap at 10 devices | Yes, plain HTTP |
| **SSE** (`text/event-stream`) | Low once connected — one persistent TCP/TLS socket, server pushes deltas, no polling wake cycles | Android: killed when app is backgrounded/Doze unless kept alive by a foreground service; iOS: background network sockets are suspended when the app is not in an approved background mode | Auto-reconnects natively in browsers (`EventSource`); on mobile HTTP clients you must implement your own reconnect+backoff and use `Last-Event-ID` for resume | Native to the protocol (`Last-Event-ID` on reconnect) if the client library supports it | Effy already runs this pattern (058's shop console) on Fargate/Go with LISTEN/NOTIFY — **$0 marginal** at 10 more connections | Ktor 3's `ktor-client-sse` plugin needs only `ktor-client-core` — it is engine-agnostic (built over a streamed HTTP response), so it should work over the Darwin engine's `NSURLSession` streaming, but **this was not independently confirmed against Darwin** in this session's search budget [Ktor SSE docs](https://ktor.io/docs/client-server-sent-events.html) |
| **WebSocket** | Similar to SSE while foregrounded (one socket, bidirectional); ping/pong keep-alive adds small periodic radio wakes | Same OS suspension issues as SSE when backgrounded; additionally several real KMP projects have hit **Darwin-specific WebSocket bugs** | Needs explicit reconnect/backoff logic (no native resume semantics beyond app-level sequence numbers) | Manual | API Gateway WebSocket API: $1/M messages + $0.25/M connection-minutes [AWS pricing](https://aws.amazon.com/api-gateway/pricing/) — trivial at 10 devices | **Confirmed problematic on iOS**: Ktor's Darwin engine has documented WebSocket issues — TLS/`wss://` problems reported in community threads, a frame-size bug that "makes WebSocket transport fundamentally unstable on Apple platforms" per one project's experience, and pong-handling bug KTOR-5540 [Ktor GitHub issue #1894](https://github.com/ktorio/ktor/issues/1894), [YouTrack KTOR-363](https://youtrack.jetbrains.com/issue/KTOR-363) |
| **FCM data messages** | Best — the OS batches/coalesces wake-ups across all apps rather than each app holding its own socket; this is precisely the mechanism Android designed to coexist with Doze [Android Doze docs](https://developer.android.com/training/monitoring-device-state/doze-standby) | Survives backgrounding *by design* — Android's Doze/App Standby exemption for high-priority FCM is the intended path, and iOS silent push (`content-available`) is Apple's equivalent, though Apple explicitly throttles/deprioritizes it (see §3) | Reconnection is Google's/Apple's problem, not the app's; FCM/APNs handle the persistent connection to the OS push service | N/A — one-shot fire-and-forget per message; **not guaranteed or ordered** (see §3) | Free (FCM has no send-side AWS/GCP charge; cost is entirely the outbox worker Effy already runs for 050/059) | Yes — Firebase KMP SDK / `firebase-messaging` on Android, APNs bridge on iOS; Effy already has this wired for 050/059 |
| **MQTT** (e.g. AWS IoT Core) | Low — designed for constrained/intermittent devices, lightweight keep-alive pings | MQTT session state (QoS 1 queued messages) survives a reconnect, but the **socket itself** is still killed by Doze/iOS suspension exactly like any other persistent connection — MQTT does not bypass OS-level background network suspension, only makes reconnection cheap | Purpose-built for this — QoS 1/2, session persistence, last-will | Native to the protocol, with queued delivery on reconnect | AWS IoT Core: $0.08/M connection-minutes + $1/M messages (5KB increments) [AWS IoT Core pricing](https://aws.amazon.com/iot-core/pricing/) — trivial at 10 devices | No official Kotlin/KMP-native MQTT client from AWS; would need a third-party MQTT library (e.g. Paho-based) per platform — **adds a dependency AWS/Ktor doesn't give you for free**, undermining the "we already have Ktor" argument |
| **AWS AppSync (GraphQL subscriptions / Events)** | Comparable to WebSocket (it *is* WebSocket under the hood for subscriptions) | Same background suspension caveats as any persistent socket | Amplify's AppSync client has built-in reconnect/resubscribe logic | Built-in via the Amplify SDK | AppSync Events: $1/M Event API operations + $0.08/M connection-minutes [AWS AppSync pricing](https://aws.amazon.com/appsync/pricing/) — trivial at 10 devices, but **introduces a second real-time backend technology** alongside the existing SSE-on-Fargate pattern | Effy already ships AWS Amplify for Cognito auth, so an Amplify-native AppSync subscription client exists for Android/iOS, but **not for the shared `commonMain` KMP layer** — it would be platform-specific glue code, breaking the "one shared driver logic" architecture rule |
| **API Gateway WebSocket API** | Same as generic WebSocket | Same OS suspension caveats | Reconnect required after the platform's own limits (below) | Manual, and **mandatory** because AWS forcibly closes the connection: **idle timeout 10 minutes, max connection lifetime 2 hours** (status code 1001) [AWS API Gateway WebSocket overview](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html) | $1/M messages + $0.25/M connection-minutes [AWS pricing](https://aws.amazon.com/api-gateway/pricing/) | Yes via Ktor's WebSocket client, subject to the same Darwin caveats above; also requires a `$connect`/`$disconnect` Lambda pair to track connection IDs in a store (DynamoDB) — new infrastructure |
| **SSE from Fargate/Go behind ALB** | Same as generic SSE | Same OS suspension caveats | ALB default idle timeout is **60 seconds** (configurable up to ~4000s) [AWS ALB docs](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html) — a naive stream dies at 60s unless the server sends periodic keep-alive comments/heartbeats or the timeout is raised, exactly the trap 058 already hit with Go's `http.Server.WriteTimeout` | Client-side reconnect + `Last-Event-ID`, same as generic SSE | **Zero marginal AWS cost** — it's the same Fargate task and ALB Effy already pays for; 10 more idle SSE connections is noise | This is Effy's **existing, proven pattern** (058's `shop_ops` channel) — reuse, don't invent |

---

## §2 What the industry uses

### Uber — polling → SSE (RAMEN) → gRPC bidi streaming
Uber's own engineering blog documents the full arc. Before RAMEN, **"at peak usage, 80% of requests made
to the backend API gateway were polling calls,"** causing battery drain, app sluggishness, network
congestion, and outages from "mis-tuned intervals." They built **RAMEN (Realtime Asynchronous Messaging
Network)**, initially **"a simple elegant protocol over SSE,"** chosen specifically for **"security,
support in mobile SDKs, and binary size impact"** over WebSocket. RAMEN added an app-level protocol on
top of plain SSE: sequence-numbered messages, 4-second heartbeats, and client reconnection logic for
delivery guarantees, plus priority buckets (High/Medium/Low), per-message TTLs, and deduplication for
low-bandwidth regions. At scale this reached **600K→1.5M concurrent connections and 70K→250K
messages/second at 99.99% server-side reliability**, before a later migration to gRPC bidirectional
streaming (QUIC/HTTP3) for lower latency and binary payloads.
[Uber's Real-Time Push Platform](https://www.uber.com/blog/real-time-push-platform/),
[Uber's Next Gen Push Platform on gRPC](https://www.uber.com/blog/ubers-next-gen-push-platform-on-grpc/)

**Effy takeaway**: Uber's own reasoning for choosing SSE over WebSocket first — "support in mobile SDKs"
and "binary size impact" — is precisely the argument for Effy too, reinforced by the *documented* Ktor
Darwin WebSocket instability (§1). Uber only moved past SSE once they needed binary framing and
bidirectional latency at *hundreds of thousands* of concurrent connections — a scale problem Effy does
not have at <10 drivers.

### DoorDash — dispatch/assignment engine, transport not detailed in available sources
DoorDash's public engineering posts focus on the **dispatch algorithm** (geospatial candidate filtering,
scoring, batching) rather than the wire transport used to notify a Dasher's phone of a new assignment.
[DoorDash: Next-Generation Optimization for Dasher Dispatch](https://careersatdoordash.com/blog/next-generation-optimization-for-dasher-dispatch-at-doordash/),
[DoorDash: Iterating Real-time Assignment Algorithms](https://careersatdoordash.com/blog/optimizing-real-time-algorithms-experimentation/).
No DoorDash source found in this session's search budget states push vs. poll vs. socket for the
Dasher app's live-offer delivery; **treat any such claim as unverified**.

### Instacart — batch-assignment engine, "fulfillment engine" re-computes every minute
Instacart's fulfillment engine **"re-computes batch plans every minute and makes dispatching decisions
just in time"** — i.e., assignment is itself a periodic (not instantaneous) process on the server side,
which changes the *urgency* requirement on the transport layer (a shopper doesn't need sub-second
notification if the assignment engine itself only ticks once a minute).
[Instacart: Space, Time and Groceries](https://tech.instacart.com/space-time-and-groceries-a315925acf3a),
[Instacart Shopper Engineering](https://medium.com/@zainali/instacart-spotlight-shopper-engineering-2c00223fb8a3).
No specific transport (push/poll/socket) for delivering the batch offer to the Shopper app was found in
available sources this session — **unverified**.

### Grab — MQTT / gRPC streaming for high-frequency GPS ingestion
A third-party technical write-up describing Grab/ride-hailing-style systems states GPS ingestion at scale
uses **"persistent connections (gRPC streams or MQTT) with Protobuf serialization... and batched
coordinate uploads."** [System Design: GPS Location Ingestion at Scale](https://dev.to/vesviet/system-design-gps-location-ingestion-at-scale-grpc-streaming-mqtt-kalman-filter-in-3pm)
is a third-party analysis, not a primary Grab engineering post, and should be weighted accordingly. Grab's
own primary blog post found in this session (**"Pharos — Searching Nearby Drivers on Road Network at
Scale"**, [engineering.grab.com](https://engineering.grab.com/pharos-searching-nearby-drivers-on-road-network-at-scale))
covers driver *discovery* (server-side geospatial indexing), not the *transport to the driver's phone*.
**Effy takeaway**: MQTT is a recurring pattern for high-frequency *location ingestion* (driver → server),
which is a different problem from Effy's stated requirement (server → driver, work assignment, low
frequency, not GPS-tick frequency).

### Swiggy — event-driven app, Kafka + "WebSocket gateway" for GPS; order-state pushed on every transition
Swiggy's own engineering blog (bytes.swiggy.com) states the delivery-partner app is **event-driven,
using a finite state machine per delivery**, where an assignment triggers a sound/vibration/confirmation
popup. Backend: **"live GPS updates... processed in real-time using Kafka... and a WebSocket gateway,"**
with location events keyed by `orderId` for per-order Kafka partition ordering, and updates pushed to
**all three parties (customer, restaurant, delivery partner) on every state change.**
[Swiggy: Architecture and Design Principles Behind the Delivery Partners App](https://bytes.swiggy.com/architecture-and-design-principles-behind-the-swiggys-delivery-partners-app-4db1d87a048a)
(note: this session's WebFetch of the article itself failed transiently; the summary above is from the
search-result snippet only — treat the WebSocket-gateway detail as **lower confidence** until the article
is re-fetched and read in full).

### Onfleet, Bringg — offline-first is the headline feature, transport specifics not public
Both vendors document **offline behaviour** prominently rather than their real-time transport:
- Onfleet: **"Offline mode allows you to keep drivers productive even in low-connectivity areas...
  drivers have two minutes to start or complete tasks before they need to return to bandwidth."**
  [Onfleet Driver App Settings](https://support.onfleet.com/hc/en-us/articles/10228814951060-Driver-App-Settings)
- Bringg: **"drivers should connect to the internet when they can [to] receive the latest updates and
  new orders"** — i.e. Bringg's own support docs frame new-work delivery as something that needs an
  active connection, consistent with a push-to-wake + fetch pattern rather than a claim that offline
  devices magically receive new assignments.
  [Bringg: A Day in the Life of a Bringg Driver](https://help.bringg.com/docs/get-started-with-the-bringg-driver-app-1)

Neither vendor's public docs disclose whether they use FCM/APNs push, WebSocket, or polling under the
hood for new-work delivery — **unverified, not found in available sources**.

### Shipday, Tookan, Samsara Driver, Amazon Flex
**Not independently verified this session** (search budget exhausted before these could be researched).
General industry pattern (used elsewhere in the delivery-SaaS space, per this author's general knowledge,
not verified against a primary source in this session) is the same push-to-wake-then-fetch hybrid
described in §4 — this should be treated as background context only, not a cited fact.

---

## §3 Background/OS constraints (the hard platform rules)

### Android
- **Doze mode** (device stationary, screen off, unplugged, for an extended period): suspends network
  access, ignores wake locks, defers `AlarmManager` alarms, blocks Wi-Fi scans, blocks sync adapters and
  `JobScheduler`/`WorkManager`. The system periodically opens **maintenance windows** to flush pending
  work; these windows become **less frequent over time** the longer Doze persists.
  [Android: Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
- **High-priority FCM messages are Android's documented exemption mechanism**: *"FCM is optimized to work
  with Doze and App Standby... a high-priority message wakes the app, grants a brief window of network
  access and a partial wake lock, delivers the message, then the device returns to Doze."* Normal-priority
  messages are deferred to the next maintenance window while in Doze. This is precisely why the industry
  push-to-wake pattern (§4) exists: **normal HTTP calls from a backgrounded app cannot reliably beat
  Doze; a high-priority FCM data message is the documented way through it.**
  [Android: Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
- **App Standby**: an app idle (no interaction, no foreground process/visible notification) has its
  background network access deferred to roughly **once per day** or on charging.
  [Android: Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
- **`setAndAllowWhileIdle()` / `setExactAndAllowWhileIdle()`** can fire alarms during Doze but are
  **rate-limited to roughly once per 9 minutes per app** — not a substitute for push.
  [Android: Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
- **Android 13+ `POST_NOTIFICATIONS` runtime permission** is required to show any notification
  (including the one a foreground service must display) — without it the foreground service can still
  run but shows no visible notification to the user, which is itself a bad UX/compliance signal for a
  service claiming to need to stay alive.
- **Android 14 foreground service types are mandatory**: calling `startForeground()` without a declared
  `android:foregroundServiceType` throws `MissingForegroundServiceTypeException`. Relevant types for a
  driver app: **`location`** (requires `FOREGROUND_SERVICE_LOCATION` + `ACCESS_FINE/COARSE_LOCATION`,
  with `ACCESS_BACKGROUND_LOCATION` needed to *start* it while already backgrounded) and **`dataSync`**
  (requires `FOREGROUND_SERVICE_DATA_SYNC`, no extra runtime permission, intended for "fetch data" /
  "receiving work" use cases). Multiple types can be declared together
  (`location|dataSync`). Google Play additionally requires declaring the foreground service type's
  justification in Play Console policy review for apps targeting Android 14+.
  [Android 14: foreground service types required](https://developer.android.com/about/versions/14/changes/fgs-types-required)
  — **a `dataSync` (or combined `location|dataSync`) foreground service is the correct Android mechanism
  if Effy ever wants to hold a live SSE/WebSocket connection open while the driver app is backgrounded**;
  it is not required if Effy relies purely on FCM high-priority push to wake the app (see §5).

### iOS
- Apple's own current developer-docs pages (`pushing-background-updates-to-your-app`,
  `generating-a-remote-notification`) render via client-side JS and returned **only page titles** to
  this session's fetch tool — the specific numeric limits below are **UNVERIFIED THIS SESSION** against
  the live page, though they reflect long-standing, widely-documented Apple platform behaviour that this
  author is highly confident is still accurate as of the current SDKs:
  - Background App Refresh and silent push (`content-available: 1`) are **scheduled and throttled by
    iOS**, not delivered on-demand; Apple explicitly reserves the right to **coalesce, delay, or drop**
    background pushes based on the device's battery level, network conditions, and the app's measured
    background-usage history. There is **no delivery guarantee**.
  - The background execution window granted to `application(_:didReceiveRemoteNotification:
    fetchCompletionHandler:)` for a silent push is short (historically documented as roughly **30
    seconds**) — long enough to fetch-the-truth from an API, not to hold a persistent stream open.
  - The one Apple mechanism with a *much* stronger reliability contract is **PushKit VoIP push**
    (`content-available` + PushKit), which is **restricted by App Review policy to actual VoIP
    calling apps** and is not a legitimate mechanism for a delivery-driver work-assignment app — using
    it for this purpose risks App Store rejection.
  - **Recommendation**: before shipping, re-verify the exact current wording and any 2025/2026 changes
    directly at
    [Apple: Pushing background updates to your app](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)
    and
    [Apple: Generating a remote notification](https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification).

### FCM's own reliability wording
Google's Firebase documentation for the payload/introductory page states FCM **"lets you reliably send
messages"** but does not, on that page, use "best-effort" phrasing explicitly; the payload limit is
confirmed: **"a message can transfer a payload of up to 4096 bytes."**
[Firebase: Cloud Messaging](https://firebase.google.com/docs/cloud-messaging). The detailed
"Understand message delivery" and "Throttling and quotas" pages that would carry the precise best-effort
/ ordering language were **not reachable this session** (404s on direct fetch) — this is a page to
re-verify before finalising the design, but it is extremely well established in the wider ecosystem
(and consistent with every third-party engineering write-up cited above, e.g. Uber's own TTL/priority/
dedup layer built *on top of* their push transport specifically because the underlying transport gives no
delivery guarantee) that **FCM/APNs push is best-effort, not exactly-once, not guaranteed-ordered, and
not a database.**

---

## §4 Requirement catalogue

1. **ESSENTIAL** — A driver who is on-duty and foregrounded must see newly assigned work without a
   manual pull-to-refresh.
2. **ESSENTIAL** — The mechanism must survive the app being backgrounded (driver in a carpark, phone in
   pocket) for typical shift durations (hours), not just seconds.
3. **ESSENTIAL** — The mechanism must not silently fail with no operator-visible signal (no push
   arrived, no error logged) — echoing 059's own "notifications recorded/attempted/skipped" outbox
   discipline.
4. **ESSENTIAL** — New-work delivery must not depend on the driver's device polling frequently enough to
   "happen to" catch a Doze maintenance window — Android's own docs name high-priority FCM as the
   designed way through Doze; anything else is fighting the OS.
5. **ESSENTIAL** — The push payload must be treated as a **hint, not the data** — see §4.30 below; fetch
   the current assignment state from the server after being woken.
6. **ESSENTIAL** — The server must remain the single source of truth for "what is this driver's current
   work," with the client holding only a mirror — directly reusing 027's proven "platform authoritative,
   optimistic local mirror" cart-sync design.
7. **ESSENTIAL** — A monotonically increasing revision/version number on the driver's assigned-work set,
   so a stale response arriving after a newer one can never overwrite it — same 027 `cart.revision`
   pattern.
8. **ESSENTIAL** — Idempotent, retry-safe fetch-the-truth calls (a woken app may race a foreground-tab
   refresh; both must converge, not duplicate).
9. **ESSENTIAL** — A visible "last synced at" / "reconnecting..." indicator so a driver never silently
   works from stale data without knowing it — this is 059's own "console survives a network dropout"
   principle, applied to the driver app.
10. **ESSENTIAL** — Reconnection with backoff for any persistent-connection option (SSE/WebSocket) —
    mobile networks drop constantly (tunnels, elevators, cell handoff).
11. **ESSENTIAL** — The server-push transport must exist ONLY on the Fargate/Go hot path (the only
    process able to hold a connection past 30 seconds) — never attempted from a Lambda.
12. **ESSENTIAL** — FCM must remain the wake/notify channel for the backgrounded case, because it is the
    platform-sanctioned way past Doze/App Standby and iOS background suspension, and it is already the
    locked, built, deployed mechanism (050/059) with an existing outbox, retry, and dead-token-pruning
    machinery Effy has already paid the cost to build.
13. **ESSENTIAL** — Android: declare `POST_NOTIFICATIONS` and request it at runtime (13+) for any
    visible notification path (including a foreground service's own notification).
14. **ESSENTIAL** — Android 14+: any foreground service Effy runs (if it chooses to hold a live
    SSE/WebSocket open while backgrounded) MUST declare a `foregroundServiceType` (`dataSync` and/or
    `location`) or the app crashes with `MissingForegroundServiceTypeException`.
15. **ESSENTIAL** — Every mutating driver action (accept collection, mark delivered, etc.) needs a
    client-generated idempotency key so a retried request after a flaky reconnect cannot double-apply —
    same pattern as 027's `changeId`.
16. **USEFUL** — SSE reconnect should send `Last-Event-ID` so the server can replay only what was
    missed, not the whole assignment history, on every reconnect.
17. **USEFUL** — A lightweight foreground-only SSE stream from Fargate (reusing 058's exact
    LISTEN/NOTIFY pattern) for the "app open" case, so a driver looking at the screen sees updates
    genuinely live (sub-second) rather than waiting on an FCM round-trip (which has no latency SLA).
18. **USEFUL** — ALB idle timeout must be raised (or a periodic SSE comment/heartbeat sent) for the
    driver SSE stream exactly as 058 already had to solve for shop console — **do not re-discover this
    defect**; reuse the fix (`http.NewResponseController`-cleared per-request `WriteTimeout`, and an ALB
    `idle_timeout.timeout_seconds` sized for the stream).
19. **USEFUL** — A local outbound-action queue on the device (accept, mark-collected, mark-delivered,
    proof-of-delivery) so a driver working through a dead zone can keep tapping through their flow and
    have it flush once connectivity returns — the offline-first pattern Onfleet/Bringg both document as
    a headline feature.
20. **USEFUL** — Optimistic UI for driver actions, with a clear "pending sync" visual state per item —
    matches Effy's own web-kit/customer-mobile "mirror first, send second" convention.
21. **USEFUL** — Server-side conflict handling when the same work item is reassigned while a driver is
    mid-action on it (e.g., admin reassigns a stranded package while the original driver is en route) —
    reuse 056's "derived on read, never stored, operator confirms" pattern for anything ambiguous about
    physical possession.
22. **USEFUL** — A background sync/WorkManager (Android) periodic fallback — e.g. every 15–30 minutes —
    purely as a safety net for the (rare, but real) case where a push was dropped; this is NOT the
    primary mechanism, just a backstop, consistent with "push as a hint, poll as a backstop."
23. **USEFUL** — Structured client-side telemetry/logging of "push received → fetch triggered → fetch
    succeeded/failed" so a live production issue ("driver didn't see new work") is diagnosable from logs
    rather than guessed at — echoes 050's own "push delivery unconfirmed" carry-forward lesson.
24. **USEFUL** — A manual pull-to-refresh MUST still exist even with real-time push, as the universally
    expected mobile affordance and the human fallback when a driver suspects staleness.
25. **USEFUL** — Foreground service (Android `dataSync`/`location` type) to hold a live SSE connection
    open while the driver app is backgrounded-but-on-shift, IF sub-30-second latency while backgrounded
    is a genuine product requirement (see §5 — at Effy's stated scale this is probably not needed; FCM
    wake + fetch is fast enough).
26. **USEFUL** — Dedicated CloudWatch/Grafana metric + alarm on the notification outbox's `skipped`/
    `failed` rate for the driver audience specifically (not blended with shop/customer), so a silent
    failure like 059's pre-existing `shop_new_order` defect (every push silently `skipped` since 050,
    nobody told) cannot recur unnoticed for the driver channel.
27. **USEFUL** — A "one service worker/one registration" style discipline equivalent for mobile:
    exactly one FCM token registration path, exactly one place `getToken`/token-refresh is handled, to
    avoid the class of defect 059 found and fixed for shop-web (duplicate service-worker
    registrations).
28. **USEFUL** — Data-only FCM messages (not `notification` blocks) so the app fully controls what, if
    anything, is shown, and — per 059's own finding for shop-web — because a platform that receives a
    push and shows nothing can have push **revoked** by the OS (iOS explicitly does this); the client
    must always surface *something* (even just refreshing silently is fine as long as it's not "nothing,
    ever").
29. **USEFUL** — Coalescing/dedup at the producer, not the client, when multiple work-change events
    happen close together (e.g. hub check-in reclassifying several packages at once) — reuse 059's
    "one intent per kind per run" coalescing lesson rather than sending N separate pushes for one
    logical event.
30. **USEFUL** — The push payload itself should carry **no more than an entity id + a change type +
    (optionally) the new revision number** — never the task list itself — both because FCM's payload
    cap is 4096 bytes (confirmed, [Firebase docs](https://firebase.google.com/docs/cloud-messaging)) and
    because a payload-carried task list can never be more current than "at send time," while a
    fetch-after-wake is current as of *now*.
31. **USEFUL** — Every "fetch the truth" call after a wake should be a single combined endpoint (all
    assigned work in one call), not N calls per work item — reusing 029's own lesson about serial
    per-item queries nearly taking the storefront down; a driver's full daily worklist is small (<50
    items) and should be one round trip.
32. **USEFUL** — Auth token refresh must be handled transparently before/during the fetch-the-truth call
    triggered by a push wake — a driver whose Cognito session expired overnight must not see a silent
    failure; either auto-refresh or force a re-login with a clear message.
33. **USEFUL** — Explicit handling of the "driver stood down mid-shift" case interacting with real-time
    delivery — reuse 056's `!== "active"` lesson (the negative-test trap) so a suspended driver's app
    doesn't keep receiving/acting on pushed work.
34. **OVERKILL-AT-OUR-SCALE** — AWS AppSync (GraphQL subscriptions or Events). Technically capable and
    cheap at 10 devices ($1/M event ops + $0.08/M connection-minutes,
    [AWS AppSync pricing](https://aws.amazon.com/appsync/pricing/)), but it introduces a **second
    real-time backend technology** alongside the SSE-on-Fargate pattern Effy already built, tested, and
    debugged (058). It has no natural home in the shared `commonMain` KMP layer (it's an
    Amplify/platform-SDK concern), fragmenting the "one driver app, one architecture" rule.
35. **OVERKILL-AT-OUR-SCALE** — API Gateway WebSocket API. Same order-of-magnitude cost as SSE-on-
    Fargate, but forces a **10-minute idle timeout / 2-hour max connection lifetime**
    ([AWS docs](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html))
    requiring mandatory client reconnect logic, PLUS a new `$connect`/`$disconnect` Lambda pair and a
    connection-id store (DynamoDB) that doesn't exist today, PLUS it still can't get around the 30-second-
    Lambda-integration constraint for anything beyond the initial handshake (all pushed messages must go
    through the `@connections` POST API from *some* long-lived process anyway — which, at Effy, is still
    Fargate). Net: more moving parts than SSE-on-Fargate for no benefit at 10 devices.
36. **OVERKILL-AT-OUR-SCALE** — AWS IoT Core / MQTT. Cheap ($0.08/M connection-minutes + $1/M messages,
    [AWS IoT Core pricing](https://aws.amazon.com/iot-core/pricing/)) and genuinely well-suited to
    constrained/intermittent devices, but there is **no official AWS-maintained KMP/Kotlin-Multiplatform
    MQTT client** — Effy would be pulling in a third-party MQTT library per platform, undermining the
    "Ktor is our one HTTP client" simplicity, for a transport whose main advantage (session-persisted
    QoS-1 delivery across reconnects) doesn't matter much when the alternative (fetch-the-truth on
    wake) is already idempotent and cheap.
37. **OVERKILL-AT-OUR-SCALE** — gRPC bidirectional streaming (Uber's *eventual* endpoint). Uber only
    needed this after RAMEN's SSE-based system was already serving 600K+ concurrent connections and
    needed lower latency + binary framing at that scale
    ([Uber gRPC blog](https://www.uber.com/blog/ubers-next-gen-push-platform-on-grpc/)). Wildly
    disproportionate engineering investment for <10 devices.
38. **OVERKILL-AT-OUR-SCALE** — A dedicated presence/connection-tracking service (who is currently
    connected, with heartbeat timeouts, etc.) of the kind large ride-hail platforms run. At <10 drivers,
    "is this driver's app currently streaming" can be answered by checking one Postgres row's
    `updated_at` — no separate service needed.
39. **OVERKILL-AT-OUR-SCALE** — Building a custom reliable-delivery layer on top of FCM (sequence
    numbers, ack/retry, TTL buckets) the way Uber's RAMEN protocol did. Uber needed this because FCM/APNs
    alone give no ordering or delivery guarantee at their scale and blast radius; at Effy's scale, "push
    is a hint, fetch is authoritative" already absorbs FCM's unreliability without needing a bespoke
    ack protocol — the fetch-the-truth call is itself the reliability layer.
40. **OVERKILL-AT-OUR-SCALE** — Multi-region / high-availability push infra, dedicated push-service
    team, custom protocol version negotiation (Uber's RAMEN v2/v3 evolution). None of this is
    proportionate to one hub and <10 drivers.
41. **USEFUL** — A simple exponential-backoff foreground SSE reconnect (start at ~1s, cap at ~30s) is
    sufficient at Effy's scale — no need for jittered/distributed backoff algorithms designed for
    thundering-herd protection at thousands of clients.
42. **ESSENTIAL** — Every write path Effy already has (accept collection, hub check-in, mark delivered)
    must independently continue to work with a **stale but present** local mirror if the real-time
    channel is currently down — the real-time layer is an optimization for latency, not a dependency
    for correctness.
43. **USEFUL** — Instrument SC-style live proofs (à la 058/059's own "twelve negative proofs, each
    executed by breaking the thing") for the real-time path specifically: kill the SSE connection mid-
    session and confirm reconnect + backfill; force a dropped FCM send and confirm the fallback poll
    still surfaces the work within N minutes; force Doze on a real device and time how long delivery
    actually takes.

---

## §5 Recommendation for Effy

### The core answer
**Hybrid, two-tier, and it is already 90% built:**

1. **Foreground / app-open tier — reuse 058's exact SSE-over-Fargate/Go pattern, extended to the driver
   audience.** Add a `driver_ops`-equivalent Postgres `LISTEN/NOTIFY` channel (or reuse `shop_ops`'s
   mechanism, generalized) fired by a trigger (or an explicit `pg_notify` call from the assignment
   write path — 058's guard already enforces "a trigger does `pg_notify` + an idempotent insert, nothing
   more," so keep this new trigger to that same narrow shape) whenever a driver's assigned-work set
   changes: new collection-run assignment, new delivery drop added, a reassignment, a stand-down. The
   SSE payload carries **no data**, exactly like 058's shop stream (`data: {}`) — it is a poke, not a
   feed. `core-api` already has the Fargate/Go process, the `http.NewResponseController`-cleared
   `WriteTimeout` fix, and the pattern of a **narrow, additional Principle-III-exception route**
   (`GET /v1/shop/live`) to copy for `GET /v1/driver/live`. This is genuinely near-zero *marginal* cost
   — same task, same ALB, ten more idle sockets.
   - Requires: raise or heartbeat around the **ALB's 60-second default idle timeout**
     ([AWS ALB docs](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html))
     exactly as 058 already learned to do for `WriteTimeout`.
   - Client: Ktor's `ktor-client-sse` plugin, which needs only `ktor-client-core`
     ([Ktor SSE docs](https://ktor.io/docs/client-server-sent-events.html)) and should work through the
     Darwin engine's streaming `NSURLSession` support without the WebSocket-specific bugs documented in
     Ktor's own issue tracker (§1) — **verify this concretely on a real iOS device early**, since this
     session could not confirm Darwin+SSE compatibility from primary sources; it is the one open technical
     risk in this recommendation.

2. **Background / backgrounded-or-killed tier — FCM high-priority data message as a wake-hint, then
   fetch-the-truth over the existing `core-api` REST endpoint(s).** This is exactly the pattern Effy has
   already built (050's outbox, 059's dead-token pruning, retry, and per-kind coalescing at the
   producer) — the driver audience needs a producer that enqueues on the same `notification_request`
   outbox with `type = driver_work_changed` (or similar), `platform` widened if needed the way 059 had
   to widen it for web push, carrying **only an entity id + revision number**, never the task list.
   On receipt, the driver app calls one combined "my current work" endpoint (§4.31) and reconciles by
   revision number (§4.7), mirroring 027's cart-sync design exactly.
   - Android: register as `FOREGROUND_SERVICE_TYPE_DATA_SYNC` (and `location` if/when live GPS tracking
     is added) **only if** Effy decides it wants the SSE connection held open while backgrounded — which
     is NOT recommended for phase 1 at this scale; simpler and more App-Store/Play-Store-safe to let the
     SSE stream close on background and rely purely on FCM wake + fetch, matching Android's own documented
     design intent ("FCM is optimized to work with Doze... an alternative to maintaining persistent
     network connections" — [Android Doze docs](https://developer.android.com/training/monitoring-device-state/doze-standby)).
   - iOS: rely on standard remote/silent push; do **not** attempt PushKit/VoIP push (App Review risk,
     §3). Accept that iOS background delivery latency is **not guaranteed** and may be throttled by Apple
     — this is why tier 1 (SSE while foregrounded) and the manual pull-to-refresh (§4.24) both exist as
     the belt-and-suspenders for exactly this platform limitation.

3. **Safety-net tier — a coarse periodic background fetch** (Android `WorkManager` every ~15 min;
   iOS Background App Refresh best-effort) purely as a backstop for the rare dropped-FCM case. This is
   NOT the primary path and should be treated, and telemetered, as such (§4.23).

### Why not the alternatives
- **WebSocket** is ruled out primarily by the **documented Ktor-Darwin instability** found in this
  session (frame-size bugs, TLS issues, pong-handling bug) — a real, cited engineering risk, not
  theoretical — combined with zero benefit over SSE for a **server-to-client-only** data need (drivers
  don't need to stream anything bidirectionally in real time; their writes are ordinary REST calls).
- **AppSync, API Gateway WebSocket API, IoT Core/MQTT** are all financially trivial at 10 devices (§1
  table has the numbers) but every one of them is a **second real-time technology** next to the
  SSE-on-Fargate pattern Effy has already built, hardened, and debugged twice (058's `WriteTimeout` trap,
  059's whole PWA slice). Introducing a second pattern for one more audience, at Effy's scale, fails the
  project's own "Principle II — promote, don't duplicate" discipline that shows up repeatedly across
  053–059's changelog entries.
- **Polling alone** (no push) is explicitly ruled out by the stated requirement — "must reflect it
  without a pull-to-refresh" — and by Uber's own documented lesson that always-on polling degrades badly
  even before you reach Effy-irrelevant scale; but a **coarse safety-net poll is fine and recommended**
  (§4.22, tier 3 above).

### Monthly cost at 10 devices
| Component | Monthly cost |
|---|---|
| SSE tier (Fargate/Go, existing task + ALB) | **$0 marginal** — same infrastructure 058 already runs |
| FCM push (send side) | **$0** — no per-message charge from Google; cost is the existing notifications Lambda/outbox worker, already built |
| API Gateway HTTP API (producer routes, fetch-the-truth REST calls) | Already within existing free-tier-adjacent usage at this volume — effectively **$0** incremental |
| **If** API Gateway WebSocket API were used instead | ~$0.01–$0.10/month at 10 devices, all-day connections (well under the free tier: 1M messages + 750K connection-minutes/month for 12 months, [AWS pricing](https://aws.amazon.com/api-gateway/pricing/)) — cheap, but not chosen (see above) |
| **If** AWS IoT Core/MQTT were used instead | ~$0.03/month connectivity (10 devices × 24h × 30d ≈ 432,000 min × $0.08/M) + negligible messaging — cheap, but not chosen |
| **If** AppSync Events were used instead | ~$0.03/month connection-minutes + negligible per-op cost — cheap, but not chosen |

**Bottom line at Effy's scale: every transport in §1 is financially trivial.** The decision is not a cost
decision — it is an **architectural-reuse and platform-reliability** decision, and both point the same
direction: extend the SSE-on-Fargate pattern Effy already owns for the foreground case, and lean on the
already-built FCM outbox for the backgrounded case, with fetch-the-truth (never payload-as-data) as the
seam between them.

---

## §6 Sources

- [Uber's Real-Time Push Platform](https://www.uber.com/blog/real-time-push-platform/) — polling→SSE
  (RAMEN) history, 80% polling-call stat, SSE-over-WebSocket rationale, scale numbers
- [Uber's Next Gen Push Platform on gRPC](https://www.uber.com/blog/ubers-next-gen-push-platform-on-grpc/)
  — RAMEN's later gRPC migration
- [DoorDash: Next-Generation Optimization for Dasher Dispatch](https://careersatdoordash.com/blog/next-generation-optimization-for-dasher-dispatch-at-doordash/)
- [DoorDash: Iterating Real-time Assignment Algorithms Through Experimentation](https://careersatdoordash.com/blog/optimizing-real-time-algorithms-experimentation/)
- [Instacart: Space, Time and Groceries](https://tech.instacart.com/space-time-and-groceries-a315925acf3a)
  — "fulfillment engine re-computes batch plans every minute"
- [Instacart Shopper Engineering (Medium)](https://medium.com/@zainali/instacart-spotlight-shopper-engineering-2c00223fb8a3)
- [Grab: Pharos — Searching Nearby Drivers on Road Network at Scale](https://engineering.grab.com/pharos-searching-nearby-drivers-on-road-network-at-scale)
- [System Design: GPS Location Ingestion at Scale (third-party analysis, not primary Grab source)](https://dev.to/vesviet/system-design-gps-location-ingestion-at-scale-grpc-streaming-mqtt-kalman-filter-in-3pm)
- [Swiggy: Architecture and Design Principles Behind the Delivery Partners App](https://bytes.swiggy.com/architecture-and-design-principles-behind-the-swiggys-delivery-partners-app-4db1d87a048a)
  (search-snippet only; full-article fetch failed transiently this session)
- [Onfleet: Driver App Settings — offline mode](https://support.onfleet.com/hc/en-us/articles/10228814951060-Driver-App-Settings)
- [Bringg: A Day in the Life of a Bringg Driver](https://help.bringg.com/docs/get-started-with-the-bringg-driver-app-1)
- [Ktor: Client engines documentation](https://ktor.io/docs/client-engines.html) — Darwin/NSURLSession,
  WebSocket support
- [Ktor: Client Server-Sent Events (SSE) documentation](https://ktor.io/docs/client-server-sent-events.html)
  — "SSE only requires the ktor-client-core artifact" (engine-agnostic)
- [Ktor GitHub Issue #1894 — Add WebSocket support for iOS](https://github.com/ktorio/ktor/issues/1894)
- [JetBrains YouTrack KTOR-363 — Add WebSocket support for the iOS](https://youtrack.jetbrains.com/issue/KTOR-363)
- [Android: Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
  — Doze restrictions, maintenance windows, high-priority-FCM exemption, App Standby, alarm rate limits
- [Android 14: Foreground service types required](https://developer.android.com/about/versions/14/changes/fgs-types-required)
  — `dataSync`/`location`/`connectedDevice` types, `MissingForegroundServiceTypeException`,
  `POST_NOTIFICATIONS`
- [Firebase: Cloud Messaging (overview)](https://firebase.google.com/docs/cloud-messaging) — 4096-byte
  payload limit; "reliably send messages" wording (detailed delivery/throttling pages 404'd this session)
- [AWS API Gateway: Overview of WebSocket APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html)
  — 10-minute idle timeout, 2-hour max connection lifetime (status code 1001), route/connection model
- [AWS API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/) — WebSocket $1/M messages +
  $0.25/M connection-minutes, free tier
- [AWS IoT Core pricing](https://aws.amazon.com/iot-core/pricing/) — MQTT $0.08/M connection-minutes,
  $1/M messages (5KB increments), free tier
- [AWS AppSync pricing](https://aws.amazon.com/appsync/pricing/) — GraphQL real-time $2/M updates +
  $0.08/M connection-minutes; AppSync Events $1/M operations + $0.08/M connection-minutes
- [AWS Elastic Load Balancing: Application Load Balancers](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
  — `idle_timeout.timeout_seconds` default 60s (confirmed via load balancer attributes table)
- Apple Developer Documentation pages referenced but **not independently verifiable this session**
  (returned only page titles to the fetch tool — JS-rendered): 
  [Pushing background updates to your app](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app),
  [Generating a remote notification](https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification) —
  content-available/silent-push throttling and background execution limits described in §3 are stated
  from well-established general knowledge of these APIs, flagged accordingly, and should be re-verified
  against the live pages before being treated as authoritative for App Review or compliance purposes.

**Research-budget disclosure**: this session's WebSearch quota (200 calls) was reported exhausted after
11 queries, which materially limited coverage of Amazon Flex, Samsara Driver, Shipday, Tookan, and a
full-text read of the Swiggy article. Everything above reflects what could be gathered via the searches
performed plus direct WebFetch of primary-source pages; nothing was fabricated to fill the gaps — gaps
are stated as gaps.
