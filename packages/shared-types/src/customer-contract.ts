/**
 * The customer-surface wire contract, as a single barrel + aggregator.
 *
 * This exists so the KMP customer mobile app can generate its Kotlin DTOs from EXACTLY the types it
 * consumes (customer + the RFC 9457 problem shape) — not the shop / back-office types it must never
 * touch. `customer.ts` remains the single source of truth (Principle II); this file only re-exports
 * and aggregates, and it is the input to `contract:gen` (013 research D15).
 *
 * The `CustomerContract` aggregator below is not used at runtime — it exists solely so the schema
 * generator, run with `--expose all`, pulls EVERY referenced DTO into `definitions`. (`-t '*'` alone
 * silently drops types; see the commit that introduced this.) Do NOT add shop/driver/admin types.
 */
import type {
  CustomerStatus,
  CustomerDTO,
  UpdateCustomerDTO,
  CredentialRoute,
  SetPasswordDTO,
  ChangePasswordDTO,
  PasswordWriteDTO,
  ResetConfirmDTO,
  PasswordChallengeResultDTO,
  PasswordWriteResultDTO,
} from "./customer";
import type { ProblemJSON } from "./problem";

export type {
  CustomerStatus,
  CustomerDTO,
  UpdateCustomerDTO,
  CredentialRoute,
  SetPasswordDTO,
  ChangePasswordDTO,
  PasswordWriteDTO,
  ResetConfirmDTO,
  PasswordChallengeResultDTO,
  PasswordWriteResultDTO,
  ProblemJSON,
};

/** Aggregator — codegen entry only (see file header). Every field forces a type into the schema. */
export interface CustomerContract {
  status: CustomerStatus;
  customer: CustomerDTO;
  updateCustomer: UpdateCustomerDTO;
  credentialRoute: CredentialRoute;
  setPassword: SetPasswordDTO;
  changePassword: ChangePasswordDTO;
  passwordWrite: PasswordWriteDTO;
  resetConfirm: ResetConfirmDTO;
  passwordChallengeResult: PasswordChallengeResultDTO;
  passwordWriteResult: PasswordWriteResultDTO;
  problem: ProblemJSON;
}
