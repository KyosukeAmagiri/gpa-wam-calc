import UIKit
import Capacitor

/// The app's web view controller; registers the plugins that live in this project rather than in npm packages.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        CAPLog.print("⚡️  MainViewController registered WidgetBridge (bridge: \(bridge != nil))")
    }
}
