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
                onResult(nil)
            }
        }
    }

    // MARK: Registration

    func signUpWithPassword(email: String, password: String, given: String, family: String,
                            onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                let result = try await Amplify.Auth.signUp(username: email, password: password,
                                                           options: signUpOptions(email, given, family))
                onResult(mapSignUp(result, email: email))
            } catch { onResult(self.failure(error)) }
        }
    }

    func signUpPasswordless(email: String, given: String, family: String,
                            onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                // password: nil — Cognito creates a genuinely passwordless user (D7).
                let result = try await Amplify.Auth.signUp(username: email, password: nil,
                                                           options: signUpOptions(email, given, family))
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
            do {
                let plugin = AWSAuthSignInOptions(authFlowType: .userSRP)
                let options = AuthSignInRequest.Options(pluginOptions: plugin)
                let result = try await Amplify.Auth.signIn(username: email, password: password, options: options)
                onResult(mapSignIn(result))
            } catch { onResult(self.failure(error)) }
        }
    }

    func signInWithEmailOtp(email: String, onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                // ALWAYS state the preferred factor — omitting it forces a factor-selection round-trip (D7).
                let plugin = AWSAuthSignInOptions(authFlowType: .userAuth(preferredFirstFactor: .emailOTP))
                let options = AuthSignInRequest.Options(pluginOptions: plugin)
                let result = try await Amplify.Auth.signIn(username: email, options: options)
                onResult(mapSignIn(result))
            } catch { onResult(self.failure(error)) }
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

    private func signUpOptions(_ email: String, _ given: String, _ family: String) -> AuthSignUpRequest.Options {
        AuthSignUpRequest.Options(userAttributes: [
            AuthUserAttribute(.email, value: email),
            AuthUserAttribute(.givenName, value: given),
            AuthUserAttribute(.familyName, value: family),
        ])
    }

    private func mapSignIn(_ result: AuthSignInResult) -> BridgeAuthResult {
        switch result.nextStep {
        case .done:
            return BridgeAuthResult(outcome: "done", destination: nil, email: nil, errorKind: nil)
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
