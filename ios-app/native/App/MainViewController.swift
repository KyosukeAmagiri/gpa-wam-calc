import UIKit
import Capacitor

/// The app's web view controller; registers the plugin that lives in this project rather than in an npm package,
/// tells the page when Siri leaves it a page or a what-if while the app is already running, and covers the app in the
/// app switcher while the Face ID lock is on.
class MainViewController: CAPBridgeViewController {
    static let shieldKey = "privacyShield"
    private var observers: [NSObjectProtocol] = []
    private var shield: UIView?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: PendingRoute.notification, object: nil, queue: .main) { [weak self] _ in
            // a running page collects the page or what-if through WidgetBridge.takeRoute; one still loading asks when it starts
            guard let webView = self?.bridge?.webView, !webView.isLoading else { return }
            webView.evaluateJavaScript("window.dispatchEvent(new Event('gpawam-siri'))")
        })
        observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.showShield()
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.shield?.removeFromSuperview()
            self?.shield = nil
        })
    }

    /// A blur over everything, so the app switcher's snapshot shows no marks.
    private func showShield() {
        guard UserDefaults.standard.bool(forKey: Self.shieldKey), shield == nil, let root = view else { return }
        let cover = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
        cover.frame = root.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        root.addSubview(cover)
        shield = cover
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }
}
