import WidgetKit
import SwiftUI

// What the app writes to the shared app group after every change (see WidgetBridgePlugin and assets/js/native.js).
struct Summary: Codable {
    var wam: Double?
    var gpa: Double?
    var maxGPA: Double
    var grade: String
    var classification: String
    var cp: Double
    var totalCP: Double
    var targetWAM: Double
    var targetGPA: Double
    var nextCode: String?
    var nextName: String?
    var nextDue: String?
    var dueSoon: Int

    static let sample = Summary(wam: 78.06, gpa: 5.813, maxGPA: 7, grade: "D", classification: "Second Class Upper",
                                cp: 160, totalCP: 240, targetWAM: 80, targetGPA: 6.3,
                                nextCode: "ACCT3001", nextName: "Group project", nextDue: nil, dueSoon: 2)

    static func load() -> Summary? {
        guard let text = UserDefaults(suiteName: "group.com.kyosukeamagiri.gpawam")?.string(forKey: "summary"),
              let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(Summary.self, from: data)
    }

    /// Whole days from today to the next due date, or nil when there is none.
    func daysToNext(from now: Date) -> Int? {
        guard let due = nextDue else { return nil }
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        guard let day = f.date(from: due) else { return nil }
        let cal = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: day)).day
    }
}

struct Entry: TimelineEntry {
    let date: Date
    let summary: Summary?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: .now, summary: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: .now, summary: Summary.load() ?? .sample))
    }

    // The numbers only change when the app writes new ones (which reloads the widget);
    // a refresh just after midnight keeps the deadline countdown right.
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let cal = Calendar.current
        let midnight = cal.date(byAdding: .minute, value: 1, to: cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: .now)!))!
        completion(Timeline(entries: [Entry(date: .now, summary: Summary.load())], policy: .after(midnight)))
    }
}

// MARK: - Views

private let brand = Color(red: 0.69, green: 0.16, blue: 0.24)
private func fixed(_ v: Double?, _ places: Int) -> String { v.map { String(format: "%.\(places)f", $0) } ?? "—" }

struct Background: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.16, green: 0.13, blue: 0.14), Color(red: 0.07, green: 0.055, blue: 0.06)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [brand.opacity(0.75), .clear], center: .topLeading, startRadius: 0, endRadius: 170)
        }
    }
}

struct DeadlineLine: View {
    let s: Summary
    let now: Date
    var body: some View {
        if let days = s.daysToNext(from: now), let name = s.nextName {
            VStack(alignment: .leading, spacing: 2) {
                Text("NEXT DUE").font(.system(size: 9, weight: .bold)).foregroundStyle(.white.opacity(0.55)).tracking(0.8)
                Text("\(s.nextCode.map { "\($0) · " } ?? "")\(name)").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white).lineLimit(2)
                Text(days == 0 ? "Today" : days == 1 ? "Tomorrow" : "In \(days) days")
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(days <= 2 ? Color(red: 1, green: 0.75, blue: 0.4) : .white.opacity(0.7))
            }
        } else {
            Text("No upcoming deadlines").font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.6))
        }
    }
}

struct SmallView: View {
    let s: Summary
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("WAM").font(.system(size: 11, weight: .bold)).foregroundStyle(.white.opacity(0.6)).tracking(0.8)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(fixed(s.wam, 2)).font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(.white).minimumScaleFactor(0.6).lineLimit(1)
                if !s.grade.isEmpty {
                    Text(s.grade).font(.system(size: 11, weight: .heavy)).foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2).background(brand, in: Capsule())
                }
            }
            Text("GPA \(fixed(s.gpa, 3)) / \(Int(s.maxGPA))").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.85))
            Spacer(minLength: 2)
            ProgressView(value: min(1, s.totalCP > 0 ? s.cp / s.totalCP : 0)).tint(brand)
            Text("\(Int(s.cp)) / \(Int(s.totalCP)) CP").font(.system(size: 11, weight: .medium)).foregroundStyle(.white.opacity(0.6))
        }
    }
}

struct MediumView: View {
    let s: Summary
    let now: Date
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            SmallView(s: s)
            Rectangle().fill(.white.opacity(0.12)).frame(width: 1)
            VStack(alignment: .leading, spacing: 8) {
                if !s.classification.isEmpty {
                    Text(s.classification).font(.system(size: 13, weight: .semibold)).foregroundStyle(.white).lineLimit(2)
                }
                DeadlineLine(s: s, now: now)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct EmptyView2: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("GPA & WAM").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
            Text("Open the app to show your WAM and GPA here.").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
        }
    }
}

struct WidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry

    var body: some View {
        let s = entry.summary
        switch family {
        case .accessoryCircular:
            if let s, let wam = s.wam {
                Gauge(value: min(100, max(0, wam)), in: 0...100) { Text("WAM") } currentValueLabel: { Text(fixed(wam, 0)) }
                    .gaugeStyle(.accessoryCircular)
            } else {
                Text("WAM").font(.system(size: 12, weight: .bold))
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text("WAM \(fixed(s?.wam, 2))").font(.system(size: 15, weight: .bold))
                Text("GPA \(fixed(s?.gpa, 3))").font(.system(size: 13, weight: .semibold))
                if let s, let days = s.daysToNext(from: entry.date), let code = s.nextCode ?? s.nextName {
                    Text("\(code) due \(days == 0 ? "today" : "in \(days)d")").font(.system(size: 12)).lineLimit(1)
                }
            }
        case .accessoryInline:
            Text("WAM \(fixed(s?.wam, 1)) · GPA \(fixed(s?.gpa, 2))")
        case .systemMedium:
            if let s { MediumView(s: s, now: entry.date) } else { EmptyView2() }
        default:
            if let s { SmallView(s: s) } else { EmptyView2() }
        }
    }
}

struct GPAWAMWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GPAWAMWidget", provider: Provider()) { entry in
            WidgetView(entry: entry).containerBackground(for: .widget) { Background() }
        }
        .configurationDisplayName("GPA & WAM")
        .description("Your WAM, GPA, credit points and next deadline.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct GPAWAMWidgets: WidgetBundle {
    var body: some Widget {
        GPAWAMWidget()
        GPAWAMLiveActivity()
    }
}
