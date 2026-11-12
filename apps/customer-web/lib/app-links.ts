import { APP_LINK_PATHS } from "@effy/shared-types"

/**
 * 116 B7 - who may open Effy's links (specs/116-links-badges-urgency/contracts/links.md). Built at build time from the
 * operator-supplied identities (Terraform `android_app_cert_sha256`, `apple_team_id`); empty = no file, so links keep
 * opening the website. Only the paths the customer app claims (`APP_LINK_PATHS`) are listed.
 */

/** Our own app's id (its build files), not an outward identifier. */
export const ANDROID_PACKAGE = "com.effyshopping.customer.mobile"

export function assetLinks(sha256: string | undefined) {
  const fingerprints = (sha256 ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f))
  if (fingerprints.length === 0) return null
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints },
    },
  ]
}

export function appleAssociation(appId: string | undefined) {
  const id = (appId ?? "").trim()
  if (!/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(id)) return null
  return {
    applinks: {
      details: [
        {
          appIDs: [id],
          components: APP_LINK_PATHS.map((p) => ({ "/": p.prefix ? `${p.path}*` : p.path })),
        },
      ],
    },
  }
}

/** JSON, no redirect, no cookie - both phone makers refuse anything else. */
export function wellKnown(body: unknown): Response {
  if (body === null) return new Response("Not found", { status: 404 })
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
}
