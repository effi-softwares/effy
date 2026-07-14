import type { ResourcesConfig } from "aws-amplify"

import { cognitoConfig, siteUrl } from "@/lib/config"

/**
 * Amplify configuration — built by hand from our own environment, NOT from `amplify_outputs.json`.
 *
 * ⚠ THE "GEN 2" AMBIGUITY, SETTLED (research D19).
 *
 * Two different things are called "Amplify Gen 2":
 *
 *   • the BACKEND toolchain (`@aws-amplify/backend`, the `ampx` CLI, `amplify/backend.ts`), which
 *     PROVISIONS AWS resources via CDK → CloudFormation; and
 *   • the CLIENT library (`aws-amplify` v6), which just talks to Cognito.
 *
 * We use the CLIENT LIBRARY ONLY. The backend toolchain is rejected outright: our Cognito pool is
 * TERRAFORM-OWNED, and `defineAuth()` would create a second, CloudFormation-managed pool — two
 * owners of one concern, which is how infrastructure ends up with a pool nobody dares touch. Even
 * Gen 2's `referenceAuth()` escape hatch demands an identity pool and two IAM roles we neither
 * have nor want, and concedes it "cannot modify the configuration of your referenced resources".
 *
 * `amplify_outputs.json` is only a JSON blob in the shape `Amplify.configure` expects. Nothing
 * requires `ampx` to emit it. So we build it from the SSM contract, exactly as @effy/web-kit
 * already does for the Vite surfaces.
 *
 * ⚠ THIS FILE IS PART OF THE (auth) CHUNK. Importing it from a guest route pulls the whole SDK
 * onto the public path and breaches the bundle budget. The dependency guard will stop you.
 */
export function amplifyConfig(): ResourcesConfig {
  const cognito = cognitoConfig()
  const origin = siteUrl()

  return {
    Auth: {
      Cognito: {
        userPoolId: cognito.userPoolId,
        userPoolClientId: cognito.userPoolClientId,

        // Email IS the identity — the pool's username attribute, and the key that converges the
        // three credential routes onto one customer.
        loginWith: {
          email: true,

          // Google. The `domain` is NOT optional: there is no pure-SDK federation path, so
          // `signInWithRedirect` bounces through the Cognito hosted domain (research D15).
          // Absent until the Google IdP is applied — omit the block rather than send a broken one.
          ...(cognito.domain
            ? {
                oauth: {
                  domain: cognito.domain,
                  scopes: ["openid", "email", "profile"],
                  redirectSignIn: [`${origin}/callback`],
                  redirectSignOut: [`${origin}/`],
                  // Authorization-code + PKCE. Never the implicit flow: a public client has no
                  // secret, and `token` would put an access token in a URL fragment.
                  responseType: "code",
                  providers: ["Google"],
                },
              }
            : {}),
        },

        // Self-registration verifies the email with a CODE, not a magic link.
        signUpVerificationMethod: "code",

        userAttributes: { email: { required: true } },

        // ⚠ NOTE the absence of `identityPoolId` and `allowGuestAccess`. That is deliberate: we
        // have no Cognito IDENTITY pool and want none. An identity pool exists to vend temporary
        // AWS credentials so a browser can call S3/AppSync directly; we only ever exchange a JWT
        // with our own API. (Setting `allowGuestAccess` here is a type error for exactly this
        // reason — it selects the identity-pool variant of the config union, which then demands an
        // `identityPoolId` we do not have.)

        // Mirrors the Terraform password_policy. Client-side only, for immediate feedback —
        // Cognito enforces the real thing.
        passwordFormat: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
          requireSpecialCharacters: false,
        },
      },
    },
  }
}
