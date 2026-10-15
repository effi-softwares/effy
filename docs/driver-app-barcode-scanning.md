# Effy Driver App — Package Scanning (research and design, 2026-10-15)

Scanning becomes the **main way a driver moves work forward**: point the phone at a package label and
the app ticks it, sorts it, or completes the step. Buttons and swipes stay as the **fallback** for
damaged labels, a broken camera, or a driver who can't scan.

Work items: Epic H in [driver-app-backlog.md](driver-app-backlog.md). Screens: the "Scanning" page of
the redesign canvas (https://claude.ai/artifact/7GaPpGaAsRL5MY7McYhyDM).

## 1. What others do

| Who | Where they scan | Fallback |
|---|---|---|
| Amazon Flex | Every package when loading at the station; failed packages again when returning them to the station | "Manually enter package ID" ([pickup](https://flex.amazon.com/blog/2024/navigating-the-package-pickup-process-with-ease), [returns](https://flex.amazon.com/blog/2025/navigating-the-package-returns-process-with-ease)) |
| Onfleet | Pickup and dropoff tasks can require named barcodes. Modes are Single, Multiple and **Auto**, which stops once every required code is scanned. A separate route-load task verifies packages at loading | Manual check-off for unreadable labels ([docs](https://docs.onfleet.com/reference/barcode-scanning), [route load](https://support.onfleet.com/hc/en-us/articles/47768817655956-Route-Load-Task)) |
| Parcel carriers and warehouses | A scan at every hand-over of custody. Receiving compares what was scanned with what was expected | Keyed entry |
| Effy's own research | Scanning is the primary check at shop pickup and at the hub, with a hard stop on a shortfall. Scanning is **not** needed at the customer's door as proof — nobody scans their own groceries | `docs/research/logistics/research-05-proof.md` §2a–2c |

What they share:
- **One scan per package at every hand-over**: shop → driver → hub → driver → customer → (hub, if failed).
- **"Auto" mode**: the step completes by itself when the last expected package is scanned.
- **A hard stop on the wrong package**.
- **Manual entry** as the fallback.

## 2. Where Effy drivers scan

| # | Step | Driver scans | What happens on each scan | When the last one is scanned | Fallback |
|---|---|---|---|---|---|
| S1 | **Shop stop** | Each package label at the counter | Ticked, green flash, "3 of 4" | **Collected automatically** after a 3-second "Collecting… Undo" | Tick by hand + swipe (today's flow) |
| S2 | **Hub check-in** | Each package as it leaves the van | **A sort instruction for that package**: LOAD NOW · Today 4–6 pm / SHELVE · Thu 15 Oct / COURIER BAY | **Checked in automatically**; the run ends | Swipe to check in all |
| S3 | **Load the van** (new — replaces per-drop "Start this drop") | Each package for this delivery run, at the hub shelf | Ticked; a parcel for another run is refused | All drops become **out for delivery** | "Mark all loaded" |
| S4 | **At the door** | The drop's packages | Ticked; a package for another address is a **hard stop** ("This is for 27 Rathdowne St") | Goes **straight to proof** (arrival recorded) | "Deliver without scanning" (recorded as manual) |
| S5 | **Return to hub** | Each failed parcel | Ticked | Return recorded; the run is complete | Swipe to check in |

At the door (S4), the scan is **not proof of delivery**: the photo or signature still is. The scan
prevents the most common last-mile mistake, which is handing over the wrong customer's bag. It also
records arrival, so the separate "Arrived" tap goes away.

Not scanned:
- The customer.
- A QR code on the shop counter or hub wall to prove arrival. This could come later; GPS and the
  package scans already show the driver was there.
- Seal numbers or cage tags (parcel-network practice that doesn't suit Effy's volume).

## 3. The label (a prerequisite — nothing has one today)

Today a package is only its order number (`EF-20481`). One order split across three shops has three
packages with the same number, so the order number cannot identify a package. Every package needs its
own label, printed by the shop when it packs the order.

- **What the code encodes:** an opaque token, `EFY1:<package code>`. The package code is a short code
  (6 characters, no look-alike characters, e.g. `7K3Q9M`) unique to one shop's portion of one order.
  No customer data and no shop name is in the code.
- **Symbology: both a QR code and a Code 128 barcode, encoding the same token.** Printing both costs
  nothing extra: both are black on the same label, and a thermal printer prints either at the same
  speed. The app reads whichever it finds first.
  - **QR** is what the phone camera aims for. It reads at any angle, still reads with roughly 30% of it
    damaged, and needs about 20 mm square.
  - **Code 128** keeps the cheapest 1D handheld laser scanners usable, if hardware is bought later. It
    is a strip about 35–40 mm wide.
  - Both always carry the same `EFY1:<package code>`, so there is never any doubt about which package
    a read means.
- **Printed beside it, readable by a person:** the package code in large type (this is what manual
  entry uses), `EF-20481 · package 2 of 3`, **EFFY · Today 4–6 pm** or **COURIER**, the destination
  suburb, and a cold or frozen mark.
- **Never on the label:** the shop's name (hidden fulfilment — the customer sees this label), the
  customer's name or street (privacy; the driver gets the address from the app), or prices.
- **Printing:** "Print labels" in the shop console at the pack step. 62 mm thermal roll or 4×6 in,
  plus A4 sticker sheets as a fallback. A courier parcel carries both the courier's label and Effy's.

## 4. Scanner experience (one shared component)

- **The camera opens in the top half** of the step's screen and **keeps scanning** (multi-scan). The
  checklist stays visible underneath, so the driver sees each row turn green.
- **Each read gives three signals:** a green flash on the frame, a short beep (silent mode respected)
  and a light haptic, plus the count rolling up ("3 of 4").
- **Different results look different:**
  - ✓ accepted (green)
  - ↺ already scanned (grey, no sound)
  - ⚠ wrong stop or address (black banner, a long double buzz, the scan is not counted)
  - ? not on your run (black banner)
- **A wrong package must stop the driver**, not flash past.
- **Debounce:** the same code within 2 seconds is ignored.
- **Controls:** a torch toggle (loading docks are dark), "Type the code" (manual entry), and "Can't
  scan? Tick by hand".
- **Auto-complete** is a bottom bar with a 3-second countdown and **Undo**. Haptic success when it
  sends.
- **Works offline.** The app already holds every package of the driver's runs, so a scan is checked on
  the phone against that list. The resulting write goes through the offline queue (backlog C1).
- **Every package outcome records how it was done:** `scan` | `manual` | `typed`. Dispatch can then
  see which shops' labels fail and which drivers skip scanning.
- **Hardware scanners:** Bluetooth ring scanners type the code like a keyboard; scan screens accept
  that input. This could come later.

## 5. Technology

- **Android:** CameraX (already in the app for photo proof) feeding **ML Kit Barcode Scanning, the
  bundled model** — available offline on first launch, about 2.4 MB
  ([docs](https://developers.google.com/ml-kit/vision/barcode-scanning/android)). Restrict the
  formats to **QR and Code 128** so reads are faster and nothing else (EAN codes on the products
  themselves) triggers a match. On iOS, set the same two types in `metadataObjectTypes`.
- **Every read is checked for the `EFY1:` prefix.** A product barcode read by accident is ignored
  silently.
- **iOS:** **AVFoundation `AVCaptureMetadataOutput`** through a Swift bridge, the same pattern as the
  auth bridge. It works on every supported iPhone. VisionKit `DataScannerViewController` is simpler
  but needs iOS 16 and an A12 chip or newer
  ([Apple docs](https://developer.apple.com/documentation/visionkit/datascannerviewcontroller)), so it
  isn't used as the only path.
- ⚠ **iOS has no live camera in the app today** (photo proof hands off to the system camera). The
  scanner gives iOS a live camera surface, which photo proof can then reuse.
- **KMP:** one `expect` `PackageScanner` composable that emits `ScanResult(code)`. The checking (is
  this one of mine, which stop, already scanned) lives in common code and is unit-tested once.

## 6. Backend changes

- A package code and label data for each package (shop fulfilment), created when the order is paid.
- The driver's run reads (`/today`, stop, drop, run) carry each package's code, so checking works
  offline.
- Collect, hub check-in and drop proof accept the scanned package ids and each one's method. A new
  **load** route covers S3, and a **return check-in** route covers S5 (backlog A4).
- The hub check-in answer gives **a sort instruction per package**, not just counts.
- Back-office and dispatch: show scan versus manual for each hand-over.
