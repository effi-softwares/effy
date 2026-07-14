import "server-only"

import { createServerRunner } from "@aws-amplify/adapter-nextjs"

import { amplifyConfig } from "./amplify-config"

/**
 * The Amplify SERVER context.
 *
 * `Amplify.configure()` does not cross the server/client boundary — there is no shared singleton
 * between a Server Component and the browser. So the config is applied in TWO places, always: the
 * `"use client"` module in the (auth) layout, and here.
 *
 * This is how a protected page or Server Action gets the customer's JWT out of the request cookies
 * so it can call the backend. It runs on the server, where bundle size is irrelevant — which is
 * exactly why guest pages read session state through here (well, through lib/session.ts) instead
 * of loading the SDK into the browser.
 *
 * ⚠ Server Components CANNOT set cookies. If `fetchAuthSession` refreshes an expired token inside
 * one, the rotated tokens cannot be written back, so the refresh is lost and repeats on every
 * render. Refresh-sensitive work belongs in `proxy.ts`, a Route Handler, or a Server Action — all
 * of which can write to the response.
 */
export const { runWithAmplifyServerContext } = createServerRunner({
  config: amplifyConfig(),
})
