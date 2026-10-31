import Foundation
import Capacitor
import WidgetKit
import AppIntents

/// Hands the calculator's summary from the web page to the home-screen widget and to Siri through the shared app group,
/// and passes pages Siri asks for back to the web page.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forgetAssistant", returnType: CAPPluginReturnPromise)
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
}
