# Contract: staff reads (091) - all additive

```ts
type HandoverStep = "collect" | "checkin" | "load" | "deliver" | "return";
type HandoverMethod = "scan" | "typed" | "manual";

AdminOrderPackageDTO.handovers?: Array<{ step: HandoverStep; method: HandoverMethod; at: string; driverName: string }>;
// readRound stops (dispatch round detail):
handovers?: { scan: number; typed: number; manual: number };
ShopDetailDTO.labelScanning?: { scanned: number; notScanned: number; sinceDays: number };
```
