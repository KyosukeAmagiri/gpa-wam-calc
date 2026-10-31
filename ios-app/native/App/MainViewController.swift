import UIKit
import Capacitor

/// The app's web view controller; registers the plugin that lives in this project rather than in an npm package,
/// and switches pages when Siri asks while the app is already running.
class MainViewController: CAPBridgeViewController {
    private var routeObserver: NSObjectProtocol?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        routeObserver = NotificationCenter.default.addObserver(forName: PendingRoute.notification, object: nil, queue: .main) { [weak self] note in
            guard let route = note.object as? String, route.allSatisfy({ $0.isLetter }),
                  let webView = self?.bridge?.webView, !webView.isLoading else { return }
            // a page still loading picks the route up itself through WidgetBridge.takeRoute
            _ = PendingRoute.take()
            webView.evaluateJavaScript("location.hash = '#/\(route)'")
        }
    }

    deinit {
        if let o = routeObserver { NotificationCenter.default.removeObserver(o) }
    }
}
