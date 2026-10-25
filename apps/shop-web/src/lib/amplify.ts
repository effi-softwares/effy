import { configureAmplify as configure } from "@effy/web-kit"

import { config } from "./env"

export function configureAmplify(): void {
  configure({
    userPoolId: config.cognitoUserPoolId(),
    clientId: config.cognitoClientId(),
  })
}
