import Amplify

/// Disambiguates Amplify's `AuthError` from the Kotlin `AuthError` that the `Shared` framework also
/// exports (both are named `AuthError`, and `SwiftAuthBridge` imports both modules). This file imports
/// only Amplify, so `AuthError` here is unambiguously Amplify's — and `Amplify.AuthError` can't be
/// written inline because `Amplify` is also a class, not just a module.
typealias CognitoAuthError = AuthError
