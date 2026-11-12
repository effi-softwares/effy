// 113: hourly - erases accounts whose deletion date has passed (Settings › Clean-ups, "Account erasure").
// Wired by hand: the provider (shared payments gateway), Cognito, the media bucket and the fingerprint key.
import type { Context } from "aws-lambda"

import { deleteMediaObject } from "@effy/edge-shared"
import { stripeGateway } from "@effy/edge-shared/payments"

import { deleteCustomerSignIn } from "../erasure/cognito"
import { loadFingerprintKey } from "../erasure/fingerprint"
import { accountErasure } from "../erasure/job"

export const handler = async (_event: unknown, context?: Context): Promise<void> => {
  await accountErasure({
    deleteProviderCustomer: (id) => stripeGateway.deleteCustomer(id),
    deleteSignIn: (sub) => deleteCustomerSignIn(sub),
    deleteLabel: (key) => deleteMediaObject(key),
    fingerprintKey: () => loadFingerprintKey(),
    timeLeft: () => context?.getRemainingTimeInMillis() ?? Number.POSITIVE_INFINITY,
  })
}
