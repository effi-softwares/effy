import Foundation
import Shared
import Amplify
import AWSCognitoAuthPlugin

/// The iOS auth bridge (013 D5). Swift implements the Kotlin `IosAuthBridge` protocol using Amplify
/// Swift (which Kotlin/Native cannot call), and `IosAuthDriver` on the Kotlin side wraps it back into
/// the common `AuthDriver` contract. Plain callbacks, so there is no `suspend`/`Flow` to produce here.
///
/// NOTE the deliberate absences mirror `AuthDriver`: there is NO password-write and NO global-sign-out
/// method — those go to the backend (FR-024). Do not add them.
final class SwiftAuthBridge: NSObject, IosAuthBridge {

    // MARK: Session

    /// ⚠ THIS RECONCILES; it does not merely read.
    ///
    /// A session that reports `isSignedIn` but cannot produce a token — an expired refresh token, or a
    /// Keychain entry that outlived the install that made it, which on iOS happens because **the
    /// Keychain survives deleting the app** — used to be reported as simply "no session". That left
    /// Amplify holding a signed-in user while the app showed a guest, and every subsequent `signIn`
    /// failed with *"There is already a user in signedIn state"*.
    ///
    /// So an unusable session is signed OUT before reporting "no session", and the two stores agree.
    ///
    /// ⚠ This is NOT the only way they diverge, and probably not the common one. `SessionManager`
    /// deliberately falls back to Guest when the customer record cannot be read at launch — a backend
    /// outage should not log anyone out, and its own comment says "the Amplify session survives for a
    /// relaunch". That path produces the same standoff with a session that is perfectly valid, so this
    /// method cannot see it. `signInRecoveringFromStaleSession` is what actually covers it.
    func fetchSession(forceRefresh: Bool, onResult: @escaping (BridgeSession?) -> Void) {
        Task {
            do {
                let options = AuthFetchSessionRequest.Options(forceRefresh: forceRefresh)
                let session = try await Amplify.Auth.fetchAuthSession(options: options)
                guard session.isSignedIn, let cognito = session as? AWSAuthCognitoSession else {
                    onResult(nil); return
                }
                let tokens = try cognito.getCognitoTokens().get()
                let sub = try cognito.getUserSub().get()
                onResult(BridgeSession(sub: sub, idToken: tokens.idToken, accessToken: tokens.accessToken))
            } catch {
                // Signed in on paper, unusable in practice. Clear it rather than leave the two stores
                // disagreeing. Sign-out is best-effort: if it fails there is nothing further to try,
                // and `signInRecoveringFromStaleSession` is the second line of defence.
                await self.clearStaleSessionIfAny()
                onResult(nil)
            }
        }
    }

    /// Sign out only if Amplify still believes someone is signed in.
    private func clearStaleSessionIfAny() async {
        let stillSignedIn = (try? await Amplify.Auth.fetchAuthSession().isSignedIn) ?? false
        if stillSignedIn { _ = await Amplify.Auth.signOut() }
    }

    /// Run a sign-in, and if Amplify refuses because a user is already signed in, clear that user and
    /// try once more.
    ///
    /// This is Amplify's own documented recovery ("SignOut the user first before calling signIn"), and
    /// it is applied at the driver rather than in a use case on purpose: a stale SDK session is an SDK
    /// concern. The closed `AuthError` set (FR-016) has no member for it and should not grow one — the
    /// domain has no decision to make here, and the customer certainly does not.
    ///
    /// ⚠ Retried EXACTLY once. If the second attempt fails it is reported, so a genuine
    /// invalid-state bug surfaces instead of spinning.
    private func signInRecoveringFromStaleSession(
        _ attempt: @escaping () async throws -> AuthSignInResult
    ) async -> BridgeAuthResult {
        do {
            return mapSignIn(try await attempt())
        } catch let error as CognitoAuthError {
            guard case .invalidState = error else { return failure(error) }
            _ = await Amplify.Auth.signOut()
            do { return mapSignIn(try await attempt()) } catch { return failure(error) }
        } catch {
            return failure(error)
        }
    }

    // MARK: Registration

    func signUpWithPassword(email: String, password: String,
                            onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                let result = try await Amplify.Auth.signUp(username: email, password: password,
                                                           options: signUpOptions(email))
                onResult(mapSignUp(result, email: email))
            } catch { onResult(self.failure(error)) }
        }
    }

    func signUpPasswordless(email: String,
                            onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                // password: nil — Cognito creates a genuinely passwordless user (D7).
                let result = try await Amplify.Auth.signUp(username: email, password: nil,
                                                           options: signUpOptions(email))
                onResult(mapSignUp(result, email: email))
            } catch { onResult(self.failure(error)) }
        }
    }

    func confirmSignUp(email: String, code: String, onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                let result = try await Amplify.Auth.confirmSignUp(for: email, confirmationCode: code)
                if result.isSignUpComplete {
                    let signIn = try await Amplify.Auth.autoSignIn()
                    onResult(mapSignIn(signIn))
                } else {
                    onResult(BridgeAuthResult(outcome: "failed", destination: nil, email: nil, errorKind: "unexpected"))
                }
            } catch { onResult(self.failure(error)) }
        }
    }

    // MARK: Sign-in

    func signInWithPassword(email: String, password: String, onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            onResult(await signInRecoveringFromStaleSession {
                let plugin = AWSAuthSignInOptions(authFlowType: .userSRP)
                let options = AuthSignInRequest.Options(pluginOptions: plugin)
                return try await Amplify.Auth.signIn(username: email, password: password, options: options)
            })
        }
    }

    func signInWithEmailOtp(email: String, onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            onResult(await signInRecoveringFromStaleSession {
                // ⚠ 035 — the platform's own SIX-digit code, not Cognito's managed eight-digit
                // EMAIL_OTP (whose length is not configurable by any setting on any object).
                // ⚠ .customWithoutSRP, never .customWithSRP: the WITH_SRP variant has a recorded
                // history of completing sign-in WITHOUT presenting the challenge.
                // ⚠ CODE ROUTE ONLY — the password route keeps .userSRP.
                let plugin = AWSAuthSignInOptions(authFlowType: .customWithoutSRP)
                let options = AuthSignInRequest.Options(pluginOptions: plugin)
                return try await Amplify.Auth.signIn(username: email, options: options)
            })
        }
    }

    func confirmOtp(code: String, onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                let result = try await Amplify.Auth.confirmSignIn(challengeResponse: code)
                onResult(mapSignIn(result))
            } catch { onResult(self.failure(error)) }
        }
    }

    /// Send the sign-UP confirmation code again (036 FR-007).
    ///
    /// ⚠ Cognito's MANAGED resend — a real API, unlike the sign-in code, which has none and must be
    /// re-initiated from scratch (see `AuthDriver.resendSignInCode`).
    func resendSignUpCode(email: String, onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                let details = try await Amplify.Auth.resendSignUpCode(for: email)
                onResult(BridgeAuthResult(outcome: "signUpConfirmation",
                                          destination: details.destination.description,
                                          email: email, errorKind: nil))
            } catch { onResult(self.failure(error)) }
        }
    }

    // MARK: Recovery / sign-out

    func startPasswordReset(email: String, onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                _ = try await Amplify.Auth.resetPassword(for: email)
                onResult(BridgeAuthResult(outcome: "otp", destination: email, email: email, errorKind: nil))
            } catch { onResult(self.failure(error)) }
        }
    }

    func signOut(onResult: @escaping () -> Void) {
        Task { _ = await Amplify.Auth.signOut(); onResult() }
    }

    // MARK: Mapping

    /// ⚠ 036 FR-032 — the NAME attributes are gone. They are optional on the pool (no `schema {}`
    /// block), so registration is unaffected; the name is written after the account exists.
    private func signUpOptions(_ email: String) -> AuthSignUpRequest.Options {
        AuthSignUpRequest.Options(userAttributes: [AuthUserAttribute(.email, value: email)])
    }

    private func mapSignIn(_ result: AuthSignInResult) -> BridgeAuthResult {
        // ⚠ THE `default` BELOW IS A SILENT-FAILURE HAZARD. Swift does not force this switch to be
        // exhaustive once a default exists, so an unhandled step compiles and surfaces as a
        // dead-end "unexpected" at runtime. Every step this app accepts is named explicitly.
        switch result.nextStep {
        case .done:
            return BridgeAuthResult(outcome: "done", destination: nil, email: nil, errorKind: nil)
        // 035 — the platform's own 6-digit code.
        case .confirmSignInWithCustomChallenge(let info):
            return BridgeAuthResult(outcome: "otp", destination: info?["maskedDestination"], email: nil, errorKind: nil)
        // ⚠ Kept during rollout: both flows coexist on the pool, so a revert is a one-constant
        // change above and an in-flight managed-factor session still completes.
        case .confirmSignInWithOTP(let details):
            return BridgeAuthResult(outcome: "otp", destination: destinationString(details), email: nil, errorKind: nil)
        default:
            return BridgeAuthResult(outcome: "failed", destination: nil, email: nil, errorKind: "unexpected")
        }
    }

    private func mapSignUp(_ result: AuthSignUpResult, email: String) -> BridgeAuthResult {
        if result.isSignUpComplete {
            return BridgeAuthResult(outcome: "done", destination: nil, email: email, errorKind: nil)
        }
        // Any not-complete step here means "confirm the emailed code".
        return BridgeAuthResult(outcome: "signupConfirm", destination: nil, email: email, errorKind: nil)
    }

    private func destinationString(_ details: AuthCodeDeliveryDetails?) -> String? {
        switch details?.destination {
        case .email(let e): return e
        case .sms(let s): return s
        default: return nil
        }
    }

    private func failure(_ error: Error) -> BridgeAuthResult {
        BridgeAuthResult(outcome: "failed", destination: nil, email: nil, errorKind: errorKind(error))
    }

    /// `userNotFound` and `notAuthorized` BOTH map to invalidCredentials — never leak whether an email
    /// is registered (FR-016).
    private func errorKind(_ error: Error) -> String {
        guard let authError = error as? CognitoAuthError else { return "unexpected" }
        switch authError {
        case .notAuthorized:
            return "invalidCredentials"
        case .service(_, _, let underlying):
            if let cognito = underlying as? AWSCognitoAuthError {
                switch cognito {
                case .userNotFound, .userNotConfirmed:
                    return "invalidCredentials"
                case .codeMismatch:
                    return "codeIncorrect"
                case .codeExpired:
                    return "codeExpired"
                case .limitExceeded, .requestLimitExceeded:
                    return "rateLimited"
                default:
                    return "unexpected"
                }
            }
            return "unexpected"
        default:
            return "unexpected"
        }
    }
}
