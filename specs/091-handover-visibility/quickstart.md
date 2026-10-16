# Quickstart: Scan Versus Manual Visibility (091)

| # | Proves | Where |
|---|---|---|
| P1 | Order packages list hand-overs oldest first; none recorded → empty | `orders` container test |
| P2 | Round stops count by method, only this round's records | `fleet` container test |
| P3 | Shop: 30-day scanned / not-scanned; older ignored | `admin` container test |
| P4 | Back-office renders each; nothing when empty | back-office component tests |
