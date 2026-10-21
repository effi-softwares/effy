package com.effyshopping.driver.mobile.core.scan

/**
 * 096 — an embedded copy of `packages/shared-types/scan-rule.fixtures.json` (commonTest cannot read
 * outside the app). `scan-rule.test.ts` fails if this copy and the JSON ever differ.
 */
internal const val SCAN_RULE_FIXTURES = """
{
  "_comment": "096 — what one read means at one step. Read by scan-rule.test.ts and the driver app's ScanRuleTest (embedded copy in ScanRuleFixture.kt, checked byte for byte); both must agree with every row.",
  "context": {
    "expected": [
      {
        "code": "7K3Q9M",
        "seq": 1,
        "of": 3
      },
      {
        "code": "R8PWX2",
        "seq": 2,
        "of": 3
      },
      {
        "code": "WTMZHX",
        "seq": 3,
        "of": 3
      }
    ],
    "counted": [
      "R8PWX2"
    ],
    "elsewhere": {
      "ABCDE2": "Drop 3 · Northcote"
    },
    "voided": [
      "VVVVV2"
    ],
    "cancelled": [
      "CCCCC2"
    ]
  },
  "cases": [
    {
      "raw": "EFY1:7K3Q9M",
      "method": "scan",
      "expect": {
        "outcome": "accepted",
        "code": "7K3Q9M",
        "words": "Bag 1 of 3"
      }
    },
    {
      "raw": "  EFY1:WTMZHX\n",
      "method": "scan",
      "expect": {
        "outcome": "accepted",
        "code": "WTMZHX",
        "words": "Bag 3 of 3"
      }
    },
    {
      "raw": "EFY1:WTMZHX\t",
      "method": "scan",
      "expect": {
        "outcome": "accepted",
        "code": "WTMZHX",
        "words": "Bag 3 of 3"
      }
    },
    {
      "raw": "7K3Q9M",
      "method": "scan",
      "expect": {
        "outcome": "accepted",
        "code": "7K3Q9M",
        "words": "Bag 1 of 3"
      }
    },
    {
      "raw": "7K3Q9M",
      "method": "typed",
      "expect": {
        "outcome": "accepted",
        "code": "7K3Q9M",
        "words": "Bag 1 of 3"
      }
    },
    {
      "raw": "wtm zhx",
      "method": "typed",
      "expect": {
        "outcome": "accepted",
        "code": "WTMZHX",
        "words": "Bag 3 of 3"
      }
    },
    {
      "raw": "WTM-ZHX",
      "method": "typed",
      "expect": {
        "outcome": "accepted",
        "code": "WTMZHX",
        "words": "Bag 3 of 3"
      }
    },
    {
      "raw": "wtmzhx",
      "method": "scan",
      "expect": {
        "outcome": "not_a_label",
        "code": null,
        "words": "Not an Effy label"
      }
    },
    {
      "raw": "EFY1:R8PWX2",
      "method": "scan",
      "expect": {
        "outcome": "already_counted",
        "code": "R8PWX2",
        "words": "Already scanned"
      }
    },
    {
      "raw": "r8pwx2",
      "method": "typed",
      "expect": {
        "outcome": "already_counted",
        "code": "R8PWX2",
        "words": "Already scanned"
      }
    },
    {
      "raw": "EFY1:ABCDE2",
      "method": "scan",
      "expect": {
        "outcome": "belongs_elsewhere",
        "code": "ABCDE2",
        "words": "For Drop 3 · Northcote — not here"
      }
    },
    {
      "raw": "EFY1:22222X",
      "method": "scan",
      "expect": {
        "outcome": "not_on_this_work",
        "code": "22222X",
        "words": "Not expected here"
      }
    },
    {
      "raw": "EFY1:VVVVV2",
      "method": "scan",
      "expect": {
        "outcome": "voided",
        "code": "VVVVV2",
        "words": "This label is no longer used"
      }
    },
    {
      "raw": "EFY1:CCCCC2",
      "method": "scan",
      "expect": {
        "outcome": "cancelled",
        "code": "CCCCC2",
        "words": "This order was cancelled"
      }
    },
    {
      "raw": "9300633603345",
      "method": "scan",
      "expect": {
        "outcome": "not_a_label",
        "code": null,
        "words": "Not an Effy label"
      }
    },
    {
      "raw": "EFY2:7K3Q9M",
      "method": "scan",
      "expect": {
        "outcome": "not_a_label",
        "code": null,
        "words": "Not an Effy label"
      }
    },
    {
      "raw": "EFY1:7k3q9m",
      "method": "scan",
      "expect": {
        "outcome": "not_a_label",
        "code": null,
        "words": "Not an Effy label"
      }
    },
    {
      "raw": "EFY1:7K3Q9O",
      "method": "scan",
      "expect": {
        "outcome": "not_a_label",
        "code": null,
        "words": "Not an Effy label"
      }
    },
    {
      "raw": "",
      "method": "typed",
      "expect": {
        "outcome": "not_a_label",
        "code": null,
        "words": "Not an Effy label"
      }
    },
    {
      "raw": "7K3Q9",
      "method": "typed",
      "expect": {
        "outcome": "not_a_label",
        "code": null,
        "words": "Not an Effy label"
      }
    },
    {
      "raw": "7K3Q90",
      "method": "typed",
      "expect": {
        "outcome": "not_a_label",
        "code": null,
        "words": "Not an Effy label"
      }
    },
    {
      "raw": "EF-12345",
      "method": "typed",
      "expect": {
        "outcome": "not_a_label",
        "code": null,
        "words": "Not an Effy label"
      }
    }
  ]
}
"""
