import Foundation
import Shared
import Amplify
import AWSCognitoAuthPlugin

/// The iOS auth bridge (013 D5). Swift implements the Kotlin `IosAuthBridge` protocol using Amplify
/// Swift (which Kotlin/Native cannot call), and `IosAuthDriver` on the Kotlin side wraps it back into
/// the common `AuthDriver` contract. Plain callbacks, so there is no `suspend`/`Flow` to produce here.
///
/// NOTE the deliberate absences mirror `AuthDriver`: there is ONLY the email-OTP flow and a local
/// sign-out — NO sign-up, NO password sign-in, NO recovery, NO global sign-out (014 FR-008/FR-028).
/// Do not add them.
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
                onResult(BridgeSession(sub: sub, accessToken: tokens.accessToken, idToken: tokens.idToken))
            } catch {
                onResult(nil)
            }
        }
    }

    // MARK: Sign-in (the ONLY credential flow: email → code)

    func signInWithEmailOtp(email: String, onResult: @escaping (BridgeAuthResult) -> Void) {
        Task {
            do {
                // ALWAYS state the preferred factor — omitting it forces a factor-selection round-trip (013 D7).
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

    // MARK: Sign-out (local only)

    func signOut(onResult: @escaping () -> Void) {
        Task { _ = await Amplify.Auth.signOut(); onResult() }
    }

    // MARK: Mapping

    private func mapSignIn(_ result: AuthSignInResult) -> BridgeAuthResult {
        switch result.nextStep {
        case .done:
            return BridgeAuthResult(outcome: "done", destination: nil, errorKind: nil)
        case .confirmSignInWithOTP(let details):
            return BridgeAuthResult(outcome: "otp", destination: destinationString(details), errorKind: nil)
        default:
            return BridgeAuthResult(outcome: "failed", destination: nil, errorKind: "unexpected")
        }
    }

    private func destinationString(_ details: AuthCodeDeliveryDetails?) -> String? {
        switch details?.destination {
        case .email(let e): return e
        case .sms(let s): return s
        default: return nil
        }
    }

    private func failure(_ error: Error) -> BridgeAuthResult {
        BridgeAuthResult(outcome: "failed", destination: nil, errorKind: errorKind(error))
    }

    /// `userNotFound` and `notAuthorized` BOTH map to invalidCredentials — never leak whether an email
    /// is a provisioned operator (FR-011).
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
