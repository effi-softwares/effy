import type { LiveKind } from "@effy/shared-types";
import type { QueryKey } from "@tanstack/react-query";

// Which of this console's queries show which kind of thing (071, FR-029). Query-key PREFIXES: an
// update re-reads whatever is on screen beneath them and marks the rest stale.
//
// ⚠ An update says only the KIND of thing that changed. What a role may then read is decided, as
// ever, by each route — a `csa` told "dispatch changed" re-reads only what a `csa` may read.
//
// The roots are spelled out here rather than imported from each slice's `queries.ts`;
// `routes.test.ts` fails if a key written here is the root of no query the console declares.
const ORDERS: QueryKey = ["orders"];
const DISPATCH: QueryKey = ["dispatch"];
const DRIVERS: QueryKey = ["drivers"];
const EXCEPTIONS: QueryKey = ["exceptions"];
const SLOTS: QueryKey = ["back-office", "delivery", "slots"];
const COVERAGE: QueryKey = ["back-office", "delivery", "coverage"];
const REVIEW: QueryKey = ["product-review"];
const CUSTOMERS: QueryKey = ["customers"];

export const LIVE_ROUTES: Partial<Record<LiveKind, readonly QueryKey[]>> = {
  orders: [ORDERS],
  // Assignment, collection, check-in, delivery and duty: the day's rounds, the roster ("who is
  // working right now"), and the exceptions those actions raise or clear.
  dispatch: [DISPATCH, DRIVERS, EXCEPTIONS],
  slots: [SLOTS],
  review: [REVIEW],
  // 074 — a customer's points changed (a credit, a checkout, a refund, an expiry): the customer
  // screens re-read. Orders too, since an order's payment lines show points spent and returned.
  points: [CUSTOMERS, ORDERS],
  // 076 — where Effy delivers changed (a postcode, a group, a distance, courier reach, a hub move):
  // an open Coverage tab re-reads, so two people editing the list see each other's changes.
  coverage: [COVERAGE],
};
