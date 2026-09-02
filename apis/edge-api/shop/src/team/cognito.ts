// Shop-pool provisioning for team management (057, US7).
//
// ⚠ IT RE-EXPORTS 009's IMPLEMENTATION RATHER THAN REIMPLEMENTING IT. That is FR-019's requirement —
// one provisioning mechanism, not two that can drift — and it is why an invite that reaches here has
// ALREADY been checked against the existing roster by the service. The safety property does not live
// in this file; it lives in the refusal above it. See `service.invite` for why that check exists and
// why research R5's "safe to reuse as-is" was wrong.
export {
  disableUser,
  enableUser,
  ensureShopUser,
  setUserGroups,
} from "../../../admin/src/shops/cognito";
