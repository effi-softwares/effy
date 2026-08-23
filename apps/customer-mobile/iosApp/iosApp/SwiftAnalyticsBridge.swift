import Foundation
import Shared
import PostHog

/// iOS analytics bridge (050). Swift implements the Kotlin `IosAnalyticsBridge` protocol using the
/// PostHog iOS SDK; `IosAnalyticsDriver` on the Kotlin side wraps it into the common `AnalyticsDriver`
/// contract and feeds it the typed `AnalyticsEvent` names/props.
///
/// ⚠ Config mirrors Android + the web (R11): autocapture OFF, screen views emitted manually, session
/// replay OFF. ⚠ NO PII: association by subject id only; props are ids/enums.
final class SwiftAnalyticsBridge: NSObject, IosAnalyticsBridge {
    private var started = false

    func setup(apiKey: String, host: String) {
        guard !started, !apiKey.isEmpty else { return }
        let config = PostHogConfig(apiKey: apiKey, host: host)
        config.captureScreenViews = false
        config.captureApplicationLifecycleEvents = false
        config.sessionReplay = false
        PostHogSDK.shared.setup(config)
        PostHogSDK.shared.register(["surface": "customer-mobile"])
        started = true
    }

    func capture(event: String, propsJson: String) {
        guard started else { return }
        var props: [String: Any] = [:]
        if let data = propsJson.data(using: .utf8),
           let parsed = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
            props = parsed
        }
        PostHogSDK.shared.capture(event, properties: props)
    }

    func identify(distinctId: String) {
        guard started else { return }
        PostHogSDK.shared.identify(distinctId)
    }

    func reset() {
        guard started else { return }
        PostHogSDK.shared.reset()
    }

    func optOut() {
        guard started else { return }
        PostHogSDK.shared.optOut()
    }
}
