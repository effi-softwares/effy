# Quickstart: Package Scanning — Foundations (090)

| # | Proves | Where |
|---|---|---|
| P1 | The scan rule: every outcome at every step (shop, hub, load, drop, return) | driver-mobile `ScanRuleTest` |
| P2 | TS and Kotlin read labels identically (shared fixture) | `package-code.test.ts`, `PackageTokenTest` |
| P3 | Debounce: once per code per 2 s | `ReadDebouncerTest` |
| P4 | Hand-over records: one per package per hand-over; retry records once; no methods = no records | driver container test |
| P5 | Hub sort: LOAD NOW / SHELVE / COURIER BAY with server words | driver unit + container test |
| P6 | Load: staged drops go out for delivery; later ones untouched; refused before opening; idempotent | driver container test; `open.guard.test.ts` |
| P7 | Android + iOS build with the reader | `assembleDebug`, `compileKotlinIosSimulatorArm64`, `xcodebuild` |

**Walk (device)**: a debug screen is not shipped; the reader is exercised by the redesign's screens. On a
device build, temporarily place `PackageScanner` on Help to read a printed 089 label on each layout.
