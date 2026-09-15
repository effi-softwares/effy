# Baseline at HEAD before 058 (T001)

**Recorded**: 2026-09-14, on `dev` at `f343236`, before any 058 file was written.

Every slice since 052 has found a gate that was **already red** and nearly mistaken it for its own
work (052: `packages/brand`; 053: two Go container suites; 055: `cm-contract-check`). This is that
check, run first so nothing here can be blamed on — or hidden behind — 058.

## JS / TypeScript

| Sweep | Result |
|---|---|
| `pnpm -r typecheck` | **exit 0**, 19 packages |
| `pnpm -r test` | **exit 0**, **18 packages reporting**, **2,123 tests**, zero failures |

⚠ Counted the *reporting packages*, not just the exit code — 029 shipped with `pnpm -r test` green
while `typecheck` was failing, and the only signal was the package count falling.

Per package: edge-admin 191 · edge-auth 151 · edge-customer 170 · edge-driver 10 · edge-fleet 62 ·
edge-inventory 59 · edge-notifications 28 · **edge-orders 16** · edge-shared 61 · **edge-shop 273** ·
back-office 190 · customer-web 458 · **shop-web 290** · api-client 6 · email-kit 91 ·
legal-content 9 · shared-types 7 · web-kit 51.

The three in bold are the ones 058 must be measured against:

- **edge-orders 16** (3 files passed, **3 skipped**) — the skipped files are its container tests.
  T009 requires this number to stay **16 and unmodified** after the refund-proposal rule is promoted.
- **edge-shop 273** and **shop-web 290** — 058's own counts grow from here.

## Go

`make core-test` — **exit 0**, every package `ok` or `[no test files]`.

## Container tests

⚠ **Docker is DOWN on this machine right now**, so every container-backed test is **skipped**, in
both the JS suites (`CONTAINER_TESTS=1` is a no-op without a daemon) and Go (`FULL=1`). 052 shipped
with exactly this gap and recorded it; 058 writes container tests regardless — they are the only
thing that has ever caught a wrong column name or a microsecond-truncated timestamp on this platform
(056) — and they must be **run by the operator with Docker up** before sign-off. Until then, every
"container test" claim in 058 means *written and compiling*, not *executed*.

## Known pre-existing red gates (NOT 058's, do not "fix" in this slice)

Recorded by earlier slices and still standing at HEAD:

- Go `platform/delivery` container tests — `z.sameday_eligible does not exist` (053).
- Go `features/saveditems` container tests — `public.delivery_pricing_rule does not exist` (033/053).
- `make check-no-phantm` fails on prose in specs 042/045/050 (053).

These are invisible in the sweeps above only because Docker is down; with Docker up, expect them.
