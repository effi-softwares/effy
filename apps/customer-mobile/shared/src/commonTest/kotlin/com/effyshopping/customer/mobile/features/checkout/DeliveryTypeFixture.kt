package com.effyshopping.customer.mobile.features.checkout

/**
 * A COPY of `packages/shared-types/src/delivery-type.fixtures.json` (079).
 *
 * ⚠ DO NOT EDIT BY HAND. `commonTest` cannot read a file outside the app, so the fixture is embedded —
 * and `packages/shared-types/src/delivery-type.test.ts` reads THIS file and fails if it differs from
 * the JSON by one case. Change the JSON, then copy it here; the TypeScript suite says the app is stale.
 */
internal const val DELIVERY_TYPE_FIXTURE = """
{
  "_comment": "079 — shared by packages/shared-types (TypeScript: deliverySummary) and customer-mobile (Kotlin: deliverySummary). `input` is an order's `delivery` and `arrivalEstimates`; `expect` is what every customer surface prints at `now`. A case that passes in one and fails in the other is the defect this file exists to catch.",
  "words": {
    "effy": "Delivered by Effy",
    "courier": "Courier delivery",
    "courierPartner": "Delivered by a courier partner.",
    "courierEstimatePrefix": "Usually arrives in",
    "courierEstimateSuffix": "— an estimate, not a guaranteed date.",
    "noWindowsLeft": "There are no Effy delivery windows available in the next few days.",
    "courierInsteadOfWindows": "We can send this order by courier instead.",
    "sameDay": "Same-day delivery",
    "standard": "Standard delivery",
    "trackParcel": "Track your parcel",
    "trackingByEmail": "Tracking for each parcel is sent to you by email.",
    "withCourier": "Your order is with the courier.",
    "scheduled": "Scheduled delivery",
    "movedToCourier": "We've changed this order to courier delivery.",
    "movedToEffy": "We've changed this order back to delivery by Effy.",
    "compensationPoints": "We've added %POINTS% points (%AMOUNT%) to your account to make up for it.",
    "compensationRefund": "We've refunded %AMOUNT% to your card to make up for it."
  },
  "shopWords": {
    "effy_driver": "Effy driver",
    "courier": "Courier"
  },
  "cases": [
    {
      "name": "a courier order: the estimate, said as an estimate, and no arrival",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "courier",
          "courierEstimate": "2–4 business days"
        },
        "arrivalEstimates": []
      },
      "expect": {
        "heading": "Courier delivery",
        "lines": [
          "Delivered by a courier partner.",
          "Usually arrives in 2–4 business days — an estimate, not a guaranteed date."
        ]
      }
    },
    {
      "name": "a courier order never reads a package's method, even if one is sent",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "courier",
          "courierEstimate": "3–5 business days"
        },
        "arrivalEstimates": [
          {
            "method": "standard",
            "promisedFrom": null,
            "promisedTo": null,
            "windowStart": null,
            "windowEnd": null
          }
        ]
      },
      "expect": {
        "heading": "Courier delivery",
        "lines": [
          "Delivered by a courier partner.",
          "Usually arrives in 3–5 business days — an estimate, not a guaranteed date."
        ]
      }
    },
    {
      "name": "a courier order travelling as several consignments: tracking comes by email, and no count",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "courier",
          "courierEstimate": "2–4 business days",
          "tracking": {
            "kind": "email"
          }
        },
        "arrivalEstimates": []
      },
      "expect": {
        "heading": "Courier delivery",
        "lines": [
          "Delivered by a courier partner.",
          "Usually arrives in 2–4 business days — an estimate, not a guaranteed date.",
          "Tracking for each parcel is sent to you by email."
        ]
      }
    },
    {
      "name": "a courier order with one tracking link: the lines are unchanged — the link is drawn by the surface",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "courier",
          "courierEstimate": "2–4 business days",
          "tracking": {
            "kind": "link",
            "url": "https://track.example.test/ABC123",
            "courierName": "Test Courier"
          }
        },
        "arrivalEstimates": []
      },
      "expect": {
        "heading": "Courier delivery",
        "lines": [
          "Delivered by a courier partner.",
          "Usually arrives in 2–4 business days — an estimate, not a guaranteed date."
        ]
      }
    },
    {
      "name": "Effy, a window today, three suppliers: one line",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "effy",
          "courierEstimate": null
        },
        "arrivalEstimates": [
          {
            "method": "same_day",
            "promisedFrom": "2026-10-08",
            "promisedTo": "2026-10-08",
            "windowStart": "2026-10-08T16:00:00+11:00",
            "windowEnd": "2026-10-08T18:00:00+11:00"
          },
          {
            "method": "same_day",
            "promisedFrom": "2026-10-08",
            "promisedTo": "2026-10-08",
            "windowStart": "2026-10-08T16:00:00+11:00",
            "windowEnd": "2026-10-08T18:00:00+11:00"
          },
          {
            "method": "same_day",
            "promisedFrom": "2026-10-08",
            "promisedTo": "2026-10-08",
            "windowStart": "2026-10-08T16:00:00+11:00",
            "windowEnd": "2026-10-08T18:00:00+11:00"
          }
        ]
      },
      "expect": {
        "heading": "Delivered by Effy",
        "lines": [
          "Same-day delivery · Today, 4 pm – 6 pm"
        ]
      }
    },
    {
      "name": "Effy, a window on a later day",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "effy",
          "courierEstimate": null
        },
        "arrivalEstimates": [
          {
            "method": "standard",
            "promisedFrom": "2026-10-10",
            "promisedTo": "2026-10-10",
            "windowStart": "2026-10-10T18:00:00+11:00",
            "windowEnd": "2026-10-10T20:30:00+11:00"
          }
        ]
      },
      "expect": {
        "heading": "Delivered by Effy",
        "lines": [
          "Standard delivery · Sat 10 Oct, 6 pm – 8:30 pm"
        ]
      }
    },
    {
      "name": "placed before 079, split across today and a carrier day: no heading, both promises",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "arrivalEstimates": [
          {
            "method": "same_day",
            "promisedFrom": "2026-10-08",
            "promisedTo": "2026-10-08",
            "windowStart": "2026-10-08T12:00:00+11:00",
            "windowEnd": "2026-10-08T14:00:00+11:00"
          },
          {
            "method": "standard",
            "promisedFrom": "2026-10-09",
            "promisedTo": "2026-10-09",
            "windowStart": null,
            "windowEnd": null
          }
        ]
      },
      "expect": {
        "heading": null,
        "lines": [
          "Same-day delivery · Today, 12 pm – 2 pm",
          "Standard delivery · Tomorrow"
        ]
      }
    },
    {
      "name": "placed before 069, no promise at all: said so, never invented",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": null,
        "arrivalEstimates": [
          {
            "method": "standard",
            "promisedFrom": null,
            "promisedTo": null,
            "windowStart": null,
            "windowEnd": null
          }
        ]
      },
      "expect": {
        "heading": null,
        "lines": [
          "Standard delivery · We'll confirm your delivery date"
        ]
      }
    },
    {
      "name": "no arrival recorded at all",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "arrivalEstimates": []
      },
      "expect": {
        "heading": null,
        "lines": [
          "We'll confirm your delivery date"
        ]
      }
    },
    {
      "name": "081 — moved to courier, compensated in points",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "courier",
          "courierEstimate": "2–4 business days",
          "moved": {
            "to": "courier",
            "at": "2026-10-08T08:30:00+11:00",
            "compensation": {
              "kind": "points",
              "amount": "2.50",
              "points": 250
            }
          }
        },
        "arrivalEstimates": []
      },
      "expect": {
        "heading": "Courier delivery",
        "lines": [
          "Delivered by a courier partner.",
          "Usually arrives in 2–4 business days — an estimate, not a guaranteed date.",
          "We've changed this order to courier delivery.",
          "We've added 250 points ($2.50) to your account to make up for it."
        ]
      }
    },
    {
      "name": "081 — moved to courier, refunded to the card",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "courier",
          "courierEstimate": "2–4 business days",
          "moved": {
            "to": "courier",
            "at": "2026-10-08T08:30:00+11:00",
            "compensation": {
              "kind": "refund",
              "amount": "9.00"
            }
          }
        },
        "arrivalEstimates": []
      },
      "expect": {
        "heading": "Courier delivery",
        "lines": [
          "Delivered by a courier partner.",
          "Usually arrives in 2–4 business days — an estimate, not a guaranteed date.",
          "We've changed this order to courier delivery.",
          "We've refunded $9.00 to your card to make up for it."
        ]
      }
    },
    {
      "name": "081 — moved to courier with nothing given says only what changed",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "courier",
          "courierEstimate": "2–4 business days",
          "moved": {
            "to": "courier",
            "at": "2026-10-08T08:30:00+11:00",
            "compensation": null
          }
        },
        "arrivalEstimates": []
      },
      "expect": {
        "heading": "Courier delivery",
        "lines": [
          "Delivered by a courier partner.",
          "Usually arrives in 2–4 business days — an estimate, not a guaranteed date.",
          "We've changed this order to courier delivery."
        ]
      }
    },
    {
      "name": "081 — moved back to Effy: the window, then what changed (no compensation line)",
      "now": "2026-10-08T09:00:00+11:00",
      "input": {
        "delivery": {
          "type": "effy",
          "courierEstimate": null,
          "moved": {
            "to": "effy",
            "at": "2026-10-08T08:30:00+11:00",
            "compensation": null
          }
        },
        "arrivalEstimates": [
          {
            "method": "same_day",
            "promisedFrom": "2026-10-08",
            "promisedTo": "2026-10-08",
            "windowStart": "2026-10-08T16:00:00+11:00",
            "windowEnd": "2026-10-08T18:00:00+11:00"
          },
          {
            "method": "same_day",
            "promisedFrom": "2026-10-08",
            "promisedTo": "2026-10-08",
            "windowStart": "2026-10-08T16:00:00+11:00",
            "windowEnd": "2026-10-08T18:00:00+11:00"
          },
          {
            "method": "same_day",
            "promisedFrom": "2026-10-08",
            "promisedTo": "2026-10-08",
            "windowStart": "2026-10-08T16:00:00+11:00",
            "windowEnd": "2026-10-08T18:00:00+11:00"
          }
        ]
      },
      "expect": {
        "heading": "Delivered by Effy",
        "lines": [
          "Same-day delivery · Today, 4 pm – 6 pm",
          "We've changed this order back to delivery by Effy."
        ]
      }
    }
  ]
}
"""
