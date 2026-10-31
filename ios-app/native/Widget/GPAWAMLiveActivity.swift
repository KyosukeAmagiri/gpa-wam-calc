import ActivityKit
import SwiftUI
import WidgetKit

private let brand = Color(red: 0.69, green: 0.16, blue: 0.24)
private let amber = Color(red: 1, green: 0.75, blue: 0.4)

/// Draws the focus timer and deadline countdowns the app starts (see WidgetBridgePlugin.startActivity).
struct GPAWAMLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GPAWAMActivityAttributes.self) { context in
            LockScreenView(kind: context.attributes.kind, state: context.state)
                .padding(16)
                .activityBackgroundTint(Color(red: 0.09, green: 0.07, blue: 0.08))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let s = context.state, timer = context.attributes.kind == "timer"
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(timer ? "Focus" : "Due", systemImage: timer ? "timer" : "calendar")
                        .font(.caption.weight(.semibold)).foregroundStyle(brand)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Clock(kind: context.attributes.kind, state: s).font(.title3.weight(.bold)).monospacedDigit()
                        .multilineTextAlignment(.trailing).frame(maxWidth: 120, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(s.code.isEmpty ? s.title : "\(s.code) · \(s.title)").font(.subheadline).lineLimit(1).foregroundStyle(.white.opacity(0.85))
                }
            } compactLeading: {
                Image(systemName: timer ? "timer" : "calendar").foregroundStyle(brand)
            } compactTrailing: {
                Clock(kind: context.attributes.kind, state: s).monospacedDigit().frame(maxWidth: 64).foregroundStyle(timer ? .white : amber)
            } minimal: {
                Image(systemName: timer ? "timer" : "calendar").foregroundStyle(brand)
            }
            .keylineTint(brand)
        }
    }
}

/// Counts down to the end when there is one (a focus block, a due time), and up from the start otherwise.
private struct Clock: View {
    let kind: String
    let state: GPAWAMActivityAttributes.ContentState

    var body: some View {
        if let end = state.end, end > Date() {
            if end.timeIntervalSinceNow > 86400 {
                Text(end, style: .relative)
            } else {
                Text(timerInterval: Date()...end, countsDown: true)
            }
        } else if kind == "timer" {
            Text(state.start, style: .timer)
        } else {
            Text("Due now")
        }
    }
}

private struct LockScreenView: View {
    let kind: String
    let state: GPAWAMActivityAttributes.ContentState

    private var heading: String {
        if kind == "timer" { return state.end == nil ? "STUDYING" : "FOCUS BLOCK" }
        guard let end = state.end else { return "DUE" }
        let day = Calendar.current.isDateInToday(end) ? "TODAY" : end.formatted(.dateTime.weekday(.abbreviated).day().month()).uppercased()
        return "DUE \(day) · \(end.formatted(date: .omitted, time: .shortened))"
    }

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                Circle().fill(brand.opacity(0.25)).frame(width: 44, height: 44)
                Image(systemName: kind == "timer" ? "timer" : "calendar").font(.title3.weight(.semibold)).foregroundStyle(brand)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(heading)
                    .font(.caption2.weight(.bold)).foregroundStyle(.white.opacity(0.6))
                Text(state.title).font(.headline).foregroundStyle(.white).lineLimit(1)
                Text([state.code, state.weight.map { "\(Int($0))%" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.white.opacity(0.7))
            }
            Spacer(minLength: 8)
            Clock(kind: kind, state: state)
                .font(.system(size: 30, weight: .bold, design: .rounded)).monospacedDigit()
                .foregroundStyle(kind == "timer" ? .white : amber)
                .multilineTextAlignment(.trailing).frame(maxWidth: 130, alignment: .trailing)
        }
    }
}
