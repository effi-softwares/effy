"use client"

import { Amplify } from "aws-amplify"
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito"
import { sessionStorage } from "aws-amplify/utils"

import { amplifyConfig } from "@/lib/amplify-config"

/**
 * Configures the Amplify client SDK — in the (auth) route group, and NOWHERE ELSE.
 *
 * ⚠ Amplify's own documentation tells you to render this in `app/layout.tsx`. FOR A STOREFRONT THAT
 * IS EXACTLY WRONG: the root layout is on every route, so the SDK would land in the client chunk
 * every guest downloads. `(auth)` is a route group, so only these pages load it, and
 * `.dependency-cruiser.cjs` fails the build if anything on the guest path can reach `aws-amplify`.
 *
 * ⚠ THE SDK'S JOB ENDS AT SIGN-IN. It talks to Cognito, receives the tokens, and they are handed to
 * the server at once (`_lib/session-handoff.ts`), which keeps them in `HttpOnly` cookies. So the SDK
 * is given this TAB's `sessionStorage` to work in — never cookies, never `localStorage` — and what
 * it leaves there is removed the moment the hand-over is read.
 */
Amplify.configure(amplifyConfig())
cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage)

export function ConfigureAmplify() {
  return null
}
