// 113: every 15 minutes - closes orders nobody paid for (Settings › Clean-ups, "Unpaid orders"). Wired by hand: the
// provider gateway and checkout's own settle step, for a payment that went through at the last moment.
import type { Context } from "aws-lambda"

import { stripeGateway } from "@effy/edge-shared/payments"

import { unpaidOrders } from "../housekeeping/job"
import { checkoutService } from "../lib/wiring"

export const handler = async (_event: unknown, context?: Context): Promise<void> => {
  await unpaidOrders({
    gateway: stripeGateway,
    settlePaid: (orderId) => checkoutService.settlePaid(orderId),
    timeLeft: () => context?.getRemainingTimeInMillis() ?? Number.POSITIVE_INFINITY,
  })
}
