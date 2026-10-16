package com.effyshopping.driver.mobile.core.scan

/**
 * A COPY of `packages/shared-types/package-code.fixtures.json` (090).
 *
 * ⚠ DO NOT EDIT BY HAND. `commonTest` cannot read a file outside the app, so the fixture is embedded —
 * and `packages/shared-types/src/package-code.test.ts` reads THIS file and fails if it differs from the
 * JSON. Change the JSON, then copy it here.
 */
internal const val PACKAGE_CODE_FIXTURE = """
{
  "_comment": "090 — how a scanner read becomes a package code. Read by package-code.test.ts and the driver app's PackageTokenTest; both must agree with every row.",
  "reads": [
    { "read": "EFY1:7K3Q9M", "code": "7K3Q9M" },
    { "read": "EFY1:23456X", "code": "23456X" },
    { "read": "  EFY1:7K3Q9M\n", "code": "7K3Q9M" },
    { "read": "EFY1:7k3q9m", "code": null },
    { "read": "EFY1:7K3Q9", "code": null },
    { "read": "EFY1:7K3Q9MM", "code": null },
    { "read": "EFY1:7K3Q9O", "code": null },
    { "read": "EFY1:1K3Q9M", "code": null },
    { "read": "EFY2:7K3Q9M", "code": null },
    { "read": "7K3Q9M", "code": null },
    { "read": "9300633603345", "code": null },
    { "read": "", "code": null }
  ]
}
"""
