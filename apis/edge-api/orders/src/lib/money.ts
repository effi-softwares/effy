// Builds the shared refund implementation (@effy/edge-shared/payments); no refund rules live here.
import { createRefundRepository, createRefundService, stripeGateway } from "@effy/edge-shared/payments";

export const refundService = createRefundService({ repo: createRefundRepository(), gateway: stripeGateway });
