import Foundation
import Capacitor
import WidgetKit
import AppIntents
import ActivityKit
import LocalAuthentication

/// Hands the calculator's summary from the web page to the home-screen widget and to Siri through the shared app group,
/// passes pages Siri asks for back to the web page, and runs the Live Activities and the Face ID lock.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forgetAssistant", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLock", returnType: CAPPluginReturnPromise)
    ]

    static let group = GradeSummary.appGroup

    /// True when the app group container exists, so the widget can actually read what the app writes.
    private var shared: Bool {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group) != nil
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let summary = call.getString("summary") else {
            call.reject("summary is missing")
            return
        }
        guard let defaults = UserDefaults(suiteName: Self.group) else {
            call.reject("app group is unavailable")
            return
        }
        defaults.set(summary, forKey: "summary")
        WidgetCenter.shared.reloadAllTimelines()
        // lets Siri recognise subject names in phrases like "What's my mark in Accounting"
        GPAWAMShortcuts.updateAppShortcutParameters()
        call.resolve(["ok": true, "shared": shared, "readable": GradeSummary.decode(summary) != nil])
    }

    @objc func status(_ call: CAPPluginCall) {
        let stored = UserDefaults(suiteName: Self.group)?.string(forKey: "summary")
        call.resolve(["shared": shared, "hasSummary": stored != nil, "siriReadable": GradeSummary.load() != nil, "memory": AssistantMemory.count])
    }

    @objc func takeRoute(_ call: CAPPluginCall) {
        guard let pending = PendingRoute.take() else { call.resolve([:]); return }
        var out: [String: Any] = ["route": pending.route]
        if let scenario = pending.scenario { out["scenario"] = scenario }
        call.resolve(out)
    }

    @objc func forgetAssistant(_ call: CAPPluginCall) {
        AssistantMemory.forget()
        call.resolve(["ok": true])
    }

    // MARK: - Live Activities

    /// Starts the focus timer or a deadline countdown, replacing any earlier one of the same kind.
    @objc func startActivity(_ call: CAPPluginCall) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["ok": false, "enabled": false])
            return
        }
        let kind = call.getString("kind") ?? "timer"
        let startMs = call.getDouble("start") ?? Date().timeIntervalSince1970 * 1000
        let endMs = call.getDouble("end") ?? 0
        let weight = call.getDouble("weight") ?? 0
        let state = GPAWAMActivityAttributes.ContentState(
            title: call.getString("title") ?? "Study", code: call.getString("code") ?? "",
            start: Date(timeIntervalSince1970: startMs / 1000),
            end: endMs > 0 ? Date(timeIntervalSince1970: endMs / 1000) : nil,
            weight: weight > 0 ? weight : nil)
        let attributes = GPAWAMActivityAttributes(kind: kind, id: call.getString("id") ?? kind)
        Task {
            for a in Activity<GPAWAMActivityAttributes>.activities where a.attributes.kind == kind {
                await a.end(nil, dismissalPolicy: .immediate)
            }
            do {
                // shown as out of date a little after its end, so a forgotten countdown doesn't linger
                let stale = state.end.map { max($0, Date()).addingTimeInterval(kind == "deadline" ? 3600 : 900) }
                _ = try Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: stale), pushType: nil)
                call.resolve(["ok": true])
            } catch {
                call.resolve(["ok": false, "error": error.localizedDescription])
            }
        }
    }

    @objc func endActivity(_ call: CAPPluginCall) {
        let kind = call.getString("kind")
        Task {
            for a in Activity<GPAWAMActivityAttributes>.activities where kind == nil || a.attributes.kind == kind {
                await a.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve(["ok": true])
        }
    }

    // MARK: - Face ID lock

    /// Face ID, Touch ID, or the passcode when those fail, so the owner can never be locked out.
    @objc func authenticate(_ call: CAPPluginCall) {
        let context = LAContext()
        var problem: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &problem) else {
            call.resolve(["ok": false, "error": problem?.localizedDescription ?? "No passcode is set on this iPhone."])
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: call.getString("reason") ?? "Unlock GPA & WAM") { ok, error in
            call.resolve(["ok": ok, "error": error?.localizedDescription ?? ""])
        }
    }

    @objc func biometry(_ call: CAPPluginCall) {
        let context = LAContext()
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        let type: String
        switch context.biometryType {
        case .faceID: type = "faceID"
        case .touchID: type = "touchID"
        case .opticID: type = "opticID"
        default: type = "none"
        }
        call.resolve(["type": type, "available": available])
    }

    /// Whether to hide the app's contents in the app switcher (MainViewController draws the cover).
    @objc func setLock(_ call: CAPPluginCall) {
        UserDefaults.standard.set(call.getBool("on") ?? false, forKey: MainViewController.shieldKey)
        call.resolve(["ok": true])
    }
}
