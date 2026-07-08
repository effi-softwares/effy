import { Amplify } from "aws-amplify";

import { config } from "./env";

// Configure Amplify against the EXISTING admin Cognito pool (feature 001): no Amplify backend
// project, no identity pool, no self sign-up. Region is derived from the pool-id prefix
// (research C1). Call once at boot, AFTER assertConfig() (config.contract.md).
export function configureAmplify(): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId(),
        userPoolClientId: config.cognitoClientId(),
        loginWith: { email: true },
      },
    },
  });
}
