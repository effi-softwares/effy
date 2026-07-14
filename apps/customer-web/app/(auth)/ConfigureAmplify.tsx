"use client"

import { Amplify } from "aws-amplify"

import { amplifyConfig } from "@/lib/amplify-config"

/**
 * Configures the Amplify client SDK — in the (auth) route group, and NOWHERE ELSE.
 *
 * ⚠ Amplify's own documentation tells you to render this in `app/layout.tsx`. For an app where
 * everyone is signed in, that is fine. FOR A STOREFRONT IT IS EXACTLY WRONG: the root layout is on
 * every route, so a `"use client"` module imported there lands in the SHARED CLIENT CHUNK THAT
 * EVERY PAGE LOADS — including the catalog pages whose speed and search visibility are the entire
 * reason this surface is server-rendered. The guest would download ~30–45 KB of authentication
 * machinery in order to look at a bag of rice.
 *
 * So it lives here. `(auth)` is a route group, so Next emits its client code as a segment chunk
 * that only these pages load. `.dependency-cruiser.cjs` fails the build if anything on the guest
 * path can reach `aws-amplify` — and that guard is proven, not assumed: it was deliberately broken
 * with a transitive leak and confirmed to catch it.
 *
 * `{ ssr: true }` is what moves the tokens from localStorage into COOKIES, which is what lets the
 * server read the session at all (lib/session.ts, lib/dal.ts). Without it, the header could not
 * greet anyone without shipping the SDK to the browser.
 */
Amplify.configure(amplifyConfig(), { ssr: true })

export function ConfigureAmplify() {
  return null
}
