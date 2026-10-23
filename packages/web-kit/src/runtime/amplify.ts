import { Amplify } from "aws-amplify";

/** Points Amplify at exactly one Cognito pool: no identity pool, no self sign-up, no password. */
export interface AmplifyPoolConfig {
  userPoolId: string;
  clientId: string;
}

export function configureAmplify({ userPoolId, clientId }: AmplifyPoolConfig): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId: clientId,
        loginWith: { email: true },
      },
    },
  });
}
