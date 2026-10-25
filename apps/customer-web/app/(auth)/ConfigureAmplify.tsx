"use client"

import { Amplify } from "aws-amplify"
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito"
import { sessionStorage } from "aws-amplify/utils"

import { amplifyConfig } from "@/lib/amplify-config"

/**
 * Configures the Amplify client SDK, in the (auth) route group only: the root layout is on every route,
 * so configuring it there would ship the SDK to every guest (`scripts/dependency-cruiser.cjs` fails the build).
 * The SDK works in this tab's `sessionStorage`; the tokens are handed to the server at once
 * (`_lib/session-handoff.ts`), kept in `HttpOnly` cookies, and the storage is cleared.
 */
Amplify.configure(amplifyConfig())
cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage)

export function ConfigureAmplify() {
  return null
}
