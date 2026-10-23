// Re-exports the shop-pool provisioning; the service refuses a reused email before this is reached.
export {
  disableUser,
  enableUser,
  ensureShopUser,
  setUserGroups,
} from "../../../admin/src/shops/cognito";
