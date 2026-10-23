import type { LiveKind } from "@effy/shared-types";
import type { QueryKey } from "@tanstack/react-query";

// Which of this console's queries show which kind of thing. Query-key prefixes: an
// update re-reads whatever is on screen beneath them and marks the rest stale.
//
// An update says only the kind of thing that changed. What a role may then read is decided, as
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
const PRICING: QueryKey = ["back-office", "delivery", "plans"];
const REVIEW: QueryKey = ["product-review"];
const CUSTOMERS: QueryKey = ["customers"];

export const LIVE_ROUTES: Partial<Record<LiveKind, readonly QueryKey[]>> = {
  orders: [ORDERS],
  // Assignment, collection, check-in, delivery and duty: the day's rounds, the roster ("who is
  // working right now"), and the exceptions those actions raise or clear.
  dispatch: [DISPATCH, DRIVERS, EXCEPTIONS],
  slots: [SLOTS],
  review: [REVIEW],
  // A customer's points changed (a credit, a checkout, a refund, an expiry): the customer
  // screens re-read. Orders too, since an order's payment lines show points spent and returned.
  points: [CUSTOMERS, ORDERS],
  // Where Effy delivers changed (a postcode, a group, a distance, courier reach, a hub move):
  // an open Coverage tab re-reads, so two people editing the list see each other's changes.
  coverage: [COVERAGE],
  // A fee plan was saved or made active: an open Pricing tab re-reads, so two managers see
  // each other's drafts and nobody activates a plan that has already been replaced.
  pricing: [PRICING],
  // A promotion or a display group changed: open promotion screens re-read.
  promotions: [["back-office", "promotions"], ["back-office", "promotion-groups"]],
};
