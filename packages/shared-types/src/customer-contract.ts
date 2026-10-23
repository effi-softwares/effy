/**
 * The customer-surface wire contract: a barrel and aggregator the customer app's Kotlin DTOs are
 * generated from (`contract:gen`). `CustomerContract` is not used at runtime; it makes the schema
 * generator (`--expose all`; `-t '*'` drops types) pull every referenced DTO in. No shop, driver or
 * admin types.
 */
import type {
  CustomerStatus,
  ClosureState,
  CustomerDTO,
  UpdateCustomerDTO,
  CredentialRoute,
  SetPasswordDTO,
  ChangePasswordDTO,
  PasswordWriteDTO,
  ResetConfirmDTO,
  PasswordChallengeResultDTO,
  PasswordWriteResultDTO,
  ClosureBlockerKind,
  ClosureBlockerDTO,
  RetainedCategoryDTO,
  ClosurePreviewDTO,
  ClosureChallengeResultDTO,
  ClosureRequestDTO,
  ClosureResultDTO,
  ClosureRestoreResultDTO,
} from "./customer";
import type { ProblemJSON } from "./problem";
import type { CustomerPointsDTO, PointsBalanceDTO, PointsEntryKind, PointsHistoryEntryDTO, PointsHistoryPageDTO } from "./points";

export type {
  CustomerStatus,
  ClosureState,
  CustomerDTO,
  UpdateCustomerDTO,
  CredentialRoute,
  SetPasswordDTO,
  ChangePasswordDTO,
  PasswordWriteDTO,
  ResetConfirmDTO,
  PasswordChallengeResultDTO,
  PasswordWriteResultDTO,
  ClosureBlockerKind,
  ClosureBlockerDTO,
  RetainedCategoryDTO,
  ClosurePreviewDTO,
  ClosureChallengeResultDTO,
  ClosureRequestDTO,
  ClosureResultDTO,
  ClosureRestoreResultDTO,
  ProblemJSON,
  CustomerPointsDTO,
  PointsBalanceDTO,
  PointsEntryKind,
  PointsHistoryEntryDTO,
  PointsHistoryPageDTO,
};

/** Codegen entry only. Every field forces a type into the schema. */
export interface CustomerContract {
  status: CustomerStatus;
  closureState: ClosureState;
  customer: CustomerDTO;
  updateCustomer: UpdateCustomerDTO;
  credentialRoute: CredentialRoute;
  setPassword: SetPasswordDTO;
  changePassword: ChangePasswordDTO;
  passwordWrite: PasswordWriteDTO;
  resetConfirm: ResetConfirmDTO;
  passwordChallengeResult: PasswordChallengeResultDTO;
  passwordWriteResult: PasswordWriteResultDTO;

  // Account closure. Every new type needs a field here, or it is never generated.
  closureBlockerKind: ClosureBlockerKind;
  closureBlocker: ClosureBlockerDTO;
  retainedCategory: RetainedCategoryDTO;
  closurePreview: ClosurePreviewDTO;
  closureChallengeResult: ClosureChallengeResultDTO;
  closureRequest: ClosureRequestDTO;
  closureResult: ClosureResultDTO;
  closureRestoreResult: ClosureRestoreResultDTO;

  // Points. Each needs its field here.
  pointsBalance: PointsBalanceDTO;
  pointsEntryKind: PointsEntryKind;
  pointsHistoryEntry: PointsHistoryEntryDTO;
  pointsHistoryPage: PointsHistoryPageDTO;
  customerPoints: CustomerPointsDTO;

  problem: ProblemJSON;
}
