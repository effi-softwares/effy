package com.effyshopping.customer.mobile.features.checkout

/**
 * A COPY of `packages/shared-types/src/delivery-window.fixtures.json` (069).
 *
 * ⚠ DO NOT EDIT BY HAND. `commonTest` cannot read a file outside the app, so the fixture is embedded —
 * and `packages/shared-types/src/delivery-window.test.ts` reads THIS file and fails if it differs from
 * the JSON by so much as one case. Change the JSON, then copy it here; the TypeScript suite says which
 * app is stale. Two hand-kept copies that a test compares are how a divergence shows up as a failure
 * rather than as two surfaces quietly saying different things (the DeliveryWireContractTest pattern).
 */
internal const val DELIVERY_WINDOW_FIXTURE = """
{
  "_comment": "Shared by packages/shared-types (TypeScript), customer-mobile and driver-mobile (Kotlin). A case that passes in one and fails in another is the defect this file exists to catch. All instants carry the Australia/Melbourne offset; AEDT (+11:00) began on 2026-10-04 and AEST (+10:00) resumes on 2027-04-04.",
  "arrival": [
    {
      "name": "window today",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "promisedFrom": "2026-10-08",
        "promisedTo": "2026-10-08",
        "windowStart": "2026-10-08T17:00:00+11:00",
        "windowEnd": "2026-10-08T19:00:00+11:00"
      },
      "expect": "Today, 5 pm – 7 pm"
    },
    {
      "name": "window with minutes",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "promisedFrom": "2026-10-08",
        "promisedTo": "2026-10-08",
        "windowStart": "2026-10-08T17:30:00+11:00",
        "windowEnd": "2026-10-08T19:15:00+11:00"
      },
      "expect": "Today, 5:30 pm – 7:15 pm"
    },
    {
      "name": "window across noon",
      "now": "2026-10-08T07:00:00+11:00",
      "input": {
        "promisedFrom": "2026-10-08",
        "promisedTo": "2026-10-08",
        "windowStart": "2026-10-08T10:00:00+11:00",
        "windowEnd": "2026-10-08T12:00:00+11:00"
      },
      "expect": "Today, 10 am – 12 pm"
    },
    {
      "name": "window read the day after",
      "now": "2026-10-09T09:00:00+11:00",
      "input": {
        "promisedFrom": "2026-10-08",
        "promisedTo": "2026-10-08",
        "windowStart": "2026-10-08T17:00:00+11:00",
        "windowEnd": "2026-10-08T19:00:00+11:00"
      },
      "expect": "Thu 8 Oct, 5 pm – 7 pm"
    },
    {
      "name": "window given as UTC instants still reads in Melbourne time",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "promisedFrom": "2026-10-08",
        "promisedTo": "2026-10-08",
        "windowStart": "2026-10-08T06:00:00Z",
        "windowEnd": "2026-10-08T08:00:00Z"
      },
      "expect": "Today, 5 pm – 7 pm"
    },
    {
      "name": "window in winter (AEST)",
      "now": "2027-06-15T09:00:00+10:00",
      "input": {
        "promisedFrom": "2027-06-15",
        "promisedTo": "2027-06-15",
        "windowStart": "2027-06-15T17:00:00+10:00",
        "windowEnd": "2027-06-15T19:00:00+10:00"
      },
      "expect": "Today, 5 pm – 7 pm"
    },
    {
      "name": "window on the day daylight saving ends",
      "now": "2027-04-04T09:00:00+10:00",
      "input": {
        "promisedFrom": "2027-04-04",
        "promisedTo": "2027-04-04",
        "windowStart": "2027-04-04T17:00:00+10:00",
        "windowEnd": "2027-04-04T19:00:00+10:00"
      },
      "expect": "Today, 5 pm – 7 pm"
    },
    {
      "name": "window on the day daylight saving starts",
      "now": "2027-10-03T09:00:00+11:00",
      "input": {
        "promisedFrom": "2027-10-03",
        "promisedTo": "2027-10-03",
        "windowStart": "2027-10-03T17:00:00+11:00",
        "windowEnd": "2027-10-03T19:00:00+11:00"
      },
      "expect": "Today, 5 pm – 7 pm"
    },
    {
      "name": "no window, today",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "promisedFrom": "2026-10-08",
        "promisedTo": "2026-10-08",
        "windowStart": null,
        "windowEnd": null
      },
      "expect": "Today"
    },
    {
      "name": "no window, tomorrow",
      "now": "2026-10-08T23:30:00+11:00",
      "input": {
        "promisedFrom": "2026-10-09",
        "promisedTo": "2026-10-09",
        "windowStart": null,
        "windowEnd": null
      },
      "expect": "Tomorrow"
    },
    {
      "name": "no window, a chosen day",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "promisedFrom": "2026-10-13",
        "promisedTo": "2026-10-13",
        "windowStart": null,
        "windowEnd": null
      },
      "expect": "Tue 13 Oct"
    },
    {
      "name": "no window, a range",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "promisedFrom": "2026-10-13",
        "promisedTo": "2026-10-15",
        "windowStart": null,
        "windowEnd": null
      },
      "expect": "Tue 13 Oct – Thu 15 Oct"
    },
    {
      "name": "no dates at all (every order placed before 069)",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "promisedFrom": null,
        "promisedTo": null,
        "windowStart": null,
        "windowEnd": null
      },
      "expect": "We'll confirm your delivery date"
    }
  ],
  "state": [
    {
      "name": "one second before the window opens",
      "now": "2026-10-08T16:59:59+11:00",
      "expect": "upcoming"
    },
    {
      "name": "the moment it opens",
      "now": "2026-10-08T17:00:00+11:00",
      "expect": "due"
    },
    {
      "name": "inside the window",
      "now": "2026-10-08T18:00:00+11:00",
      "expect": "due"
    },
    {
      "name": "the moment it closes",
      "now": "2026-10-08T19:00:00+11:00",
      "expect": "due"
    },
    {
      "name": "one second after it closes",
      "now": "2026-10-08T19:00:01+11:00",
      "expect": "late"
    }
  ],
  "stateWindow": {
    "startAt": "2026-10-08T17:00:00+11:00",
    "endAt": "2026-10-08T19:00:00+11:00"
  }
}
"""
