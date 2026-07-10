import { Amplify } from "aws-amplify";

/**
 * Point Amplify at exactly one Cognito pool.
 *
 * No identity pool, no self sign-up, no password: every Effy pool is passwordless EMAIL_OTP
 * (constitution Principle IV). A surface configures the pool for its own audience and no other.
 */
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
