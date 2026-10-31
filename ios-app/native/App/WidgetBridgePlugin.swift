import Foundation
import Capacitor
import WidgetKit

/// Hands the calculator's summary from the web page to the home-screen widget through the shared app group.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise)
    ]

    static let group = "group.com.kyosukeamagiri.gpawam"

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
        call.resolve(["ok": true, "shared": shared])
    }

    @objc func status(_ call: CAPPluginCall) {
        let stored = UserDefaults(suiteName: Self.group)?.string(forKey: "summary")
        call.resolve(["shared": shared, "hasSummary": stored != nil])
    }
}
