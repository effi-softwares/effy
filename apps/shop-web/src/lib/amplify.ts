import { configureAmplify as configure } from "@effy/web-kit";

import { config } from "./env";

// Point Amplify at the SHOP Cognito pool (feature 001). Call once at boot, AFTER assertConfig().
// A token minted here is structurally unusable against any other audience's service, and a
// back-office token is structurally unusable against /store/v1/* (constitution Principle IV).
export function configureAmplify(): void {
  configure({
    userPoolId: config.cognitoUserPoolId(),
    clientId: config.cognitoClientId(),
  });
}
