import ActivityKit
import Foundation

/// A Live Activity on the Lock Screen and in the Dynamic Island: the running focus timer, or a countdown to a due
/// time. Compiled into both the app (which starts and ends them) and the widget extension (which draws them).
struct GPAWAMActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var code: String
        var start: Date
        var end: Date?      // the focus block's end, or the due time
        var weight: Double?
    }

    var kind: String        // "timer" or "deadline"
    var id: String
}
