# Quickstart — 096 walk on dev

## Prerequisites

1. **Phase 0 (research-08).** 088–093 are migrated, deployed and walked. Then 096's migration
   (`make db-up ENV=dev`) and deploy, in the order in [plan.md](plan.md#deploy-order).
2. **Q0: hardware (operator).** Name the label printer (model, dpi, roll) and the handheld scanner used
   at a test shop and at the hub. For direct printing on a Zebra, install Zebra Browser Print on the shop PC
   and open `https://localhost:9101` once to accept its certificate.
3. A test order with two shops. Shop A's portion has ambient and frozen lines; shop B's is ambient only.

## Walk

| # | Do | Expect |
|---|---|---|
| Q1 | Shop A: declare 0 frozen bags | Refused: "a frozen bag is needed" |
| Q2 | Shop A: declare 2 ambient + 1 frozen, then print at 4×6 | 3 labels, codes distinct, "1 OF 3"…"3 OF 3", FROZEN reversed on bag 3. One page each, nothing clipped, no blank page |
| Q3 | Print the same at A4 and at 62 mm | 4-up sheet; compact roll. Every block present |
| Q4 | **Print-and-read test (SC-002)**: print 100 labels per size (mixed zones, long and short addresses) and scan each once with the handheld and once with a phone | At least 98 of 100 read on the first attempt, per size and per reader. Afterwards the hand-over report's first-read rate tracks it in use |
| Q5 | Try to void bag 2 of 3 after printing; void bag 1; then re-declare 2 ambient + 2 frozen and mark ready before reprinting | Bag 2: refused, "re-declare and reprint". Bag 1: refused. Ready: refused, naming the unprinted count |
| Q6 | Pack-scan 3 labels | "Packed 3 of 3". Back-office: switch `pack_scan_required` on and confirm the gate |
| Q7 | Driver: collect shop A, scanning 2 of 3 bags | Stop stays open, "1 bag not scanned or marked missing" |
| Q8 | Scan shop B's bag at shop A's stop | Hard stop "This bag is for …". Back-office report counts a refused read |
| Q9 | Hub station (back-office, admin): scan the collected bags | Each "At hub" with its sort instruction. The run closes when every bag is in or held |
| Q10 | Load the van with one bag declared missing (damaged) | The rest of the package loads. Exceptions shows the bag. Resolve Found |
| Q11 | Door: scan every bag of the drop | Drop completes only with all bags accounted for |
| Q12 | Back-office scan box: scan a bag, a package (089) label, and type an order number | Each opens the order with the bag or package highlighted |
| Q13 | Offline driver: scan two bags with no signal, reconnect | Recorded once each, with device time |
| Q14 | Customer (web + app): open the delivered order → Delivery note | Items, supplied quantities, part and unavailable marked. No price or shop. PDF downloads |
| Q15 | Back-office: set legal name and ABN (operator-supplied), fee treatment, classify all products, enable invoices | Enable is refused until each is set |
| Q16 | Customer: download the tax invoice; refund one item; download the adjustment | All ATO elements present, GST to the cent, invoice unchanged |

## Guards and tests to run

```sh
pnpm --filter @effy/shared-types test          # scan rule fixtures, package-code
pnpm --filter @effy/shop-web test              # label SVG rules, fitText, ZPL raster, print gates
pnpm --filter @effy/back-office test
for s in shared shop driver fleet orders commerce catalog; do pnpm --filter @effy/edge-$s test; done   # incl. container tests
scripts/check-shop-delivery-words.sh && scripts/check-driver-delivery-words.sh && scripts/check-no-refresh-timers.sh
(cd apps/driver-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug)
```
