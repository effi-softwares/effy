import { configureAmplify as configure } from "@effy/web-kit";

import { config } from "./env";

// Point Amplify at the existing back-office Cognito pool (feature 001): no Amplify backend project,
// no identity pool, no self sign-up. Call once at boot, after assertConfig (config.contract.md).
// The wiring is shared; the pool is this surface's alone.
export function configureAmplify(): void {
  configure({
    userPoolId: config.cognitoUserPoolId(),
    clientId: config.cognitoClientId(),
  });
}
