import AppIntents
import SwiftUI
#if canImport(FoundationModels)
import FoundationModels
#endif

// Siri, Shortcuts, Spotlight and Apple Intelligence all reach the calculator through these App Intents.
// They read the summary the web app last saved (GradeSummary), so they answer without opening the app.

private let noData = "Open GPA & WAM once so it can share your marks with Siri."
private let burgundy = Color(red: 0.616, green: 0.133, blue: 0.208)

// MARK: - Quick answers

struct WAMIntent: AppIntent {
    static let title: LocalizedStringResource = "Get my WAM"
    static let description = IntentDescription("Tells you your weighted average mark and how it compares with your target.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        let s = GradeSummary.load()
        let text = s?.wamText ?? noData
        return .result(value: text, dialog: "\(text)", view: SummarySnippet(summary: s))
    }
}

struct GPAIntent: AppIntent {
    static let title: LocalizedStringResource = "Get my GPA"
    static let description = IntentDescription("Tells you your grade point average and how it compares with your target.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        let s = GradeSummary.load()
        let text = s?.gpaText ?? noData
        return .result(value: text, dialog: "\(text)", view: SummarySnippet(summary: s))
    }
}

struct GradeSummaryIntent: AppIntent {
    static let title: LocalizedStringResource = "Get my grade summary"
    static let description = IntentDescription("Your WAM, GPA, credit points and next deadline in one answer. Its text can feed other Shortcuts actions, such as Use Model.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        let s = GradeSummary.load()
        let text = s?.overviewText ?? noData
        return .result(value: s?.modelContext ?? noData, dialog: "\(text)", view: SummarySnippet(summary: s))
    }
}

struct NextDueIntent: AppIntent {
    static let title: LocalizedStringResource = "Get upcoming deadlines"
    static let description = IntentDescription("Lists the next assessments that are due and anything overdue.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        let s = GradeSummary.load()
        let text = s?.dueText ?? noData
        return .result(value: text, dialog: "\(text)", view: DeadlinesSnippet(summary: s))
    }
}

struct TargetIntent: AppIntent {
    static let title: LocalizedStringResource = "Check my target"
    static let description = IntentDescription("Says what average you need to reach your target WAM, and your odds of getting there.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        let s = GradeSummary.load()
        let text = s?.targetText ?? noData
        return .result(value: text, dialog: "\(text)", view: SummarySnippet(summary: s))
    }
}

// MARK: - Subjects

struct SubjectEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Subject"
    static let defaultQuery = SubjectQuery()

    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name.isEmpty ? id : name)", subtitle: "\(id)")
    }

    /// In-progress subjects first, then completed ones, newest first; one entry per code.
    static func all() -> [SubjectEntity] {
        guard let s = GradeSummary.load() else { return [] }
        var seen = Set<String>(), out: [SubjectEntity] = []
        let rows = (s.current ?? []).map { ($0.code, $0.name) } + (s.done ?? []).reversed().map { ($0.code, $0.name) }
        for (code, name) in rows {
            guard let code = code, !code.isEmpty, !seen.contains(code) else { continue }
            seen.insert(code)
            out.append(SubjectEntity(id: code, name: name ?? ""))
        }
        return out
    }
}

struct SubjectQuery: EntityStringQuery {
    func entities(for identifiers: [SubjectEntity.ID]) async throws -> [SubjectEntity] {
        SubjectEntity.all().filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [SubjectEntity] {
        let q = string.lowercased().trimmingCharacters(in: .whitespaces)
        let compact = q.replacingOccurrences(of: " ", with: "")
        return SubjectEntity.all().filter { $0.name.lowercased().contains(q) || $0.id.lowercased().contains(compact) }
    }

    func suggestedEntities() async throws -> [SubjectEntity] { SubjectEntity.all() }
}

struct SubjectIntent: AppIntent {
    static let title: LocalizedStringResource = "Check a subject"
    static let description = IntentDescription("Your mark in a subject, and what you need on the rest of it for each grade.")

    @Parameter(title: "Subject")
    var subject: SubjectEntity

    static var parameterSummary: some ParameterSummary { Summary("Check \(\.$subject)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        guard let s = GradeSummary.load() else { return .result(value: noData, dialog: "\(noData)") }
        AssistantMemory.noteSubject(subject.id)
        let text = s.subjectText(code: subject.id)
        return .result(value: text, dialog: "\(text)")
    }
}

// MARK: - Opening a page

enum AppPage: String, AppEnum {
    case dashboard, subjects, assessments, insights, scanner, planner, degree, summary, history, settings

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Page"
    static let caseDisplayRepresentations: [AppPage: DisplayRepresentation] = [
        .dashboard: "Dashboard", .subjects: "Subjects", .assessments: "Assessments", .insights: "Insights",
        .scanner: "Risk and opportunity", .planner: "Planner", .degree: "Degree map", .summary: "Academic summary",
        .history: "History", .settings: "Settings",
    ]
}

/// Hands a page from Siri to the web view: MainViewController switches pages straight away when the
/// app is already running, and the web app asks for it (WidgetBridge.takeRoute) when it starts.
enum PendingRoute {
    static let key = "pendingRoute"
    static let notification = Notification.Name("GPAWAMOpenRoute")

    static func set(_ route: String) {
        UserDefaults.standard.set(["route": route, "at": Date().timeIntervalSince1970], forKey: key)
        NotificationCenter.default.post(name: notification, object: route)
    }

    /// The waiting page, if Siri asked for one in the last two minutes; asking clears it.
    static func take() -> String? {
        guard let d = UserDefaults.standard.dictionary(forKey: key) else { return nil }
        UserDefaults.standard.removeObject(forKey: key)
        guard let route = d["route"] as? String, let at = d["at"] as? Double, Date().timeIntervalSince1970 - at < 120 else { return nil }
        return route
    }
}

struct OpenPageIntent: AppIntent {
    static let title: LocalizedStringResource = "Open a page"
    static let description = IntentDescription("Opens the calculator on the page you name.")
    static let openAppWhenRun = true

    @Parameter(title: "Page")
    var page: AppPage

    static var parameterSummary: some ParameterSummary { Summary("Open \(\.$page)") }

    @MainActor
    func perform() async throws -> some IntentResult {
        PendingRoute.set(page.rawValue)
        return .result()
    }
}

// MARK: - Apple Intelligence

struct AskIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask about my grades"
    static let description = IntentDescription("Answers any question about your marks with Apple Intelligence, on this iPhone, in the style you chose in Settings.")

    @Parameter(title: "Question", requestValueDialog: "What would you like to know about your grades?")
    var question: String

    static var parameterSummary: some ParameterSummary { Summary("Ask \(\.$question)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let answer = await GradeAssistant.answer(question)
        return .result(value: answer, dialog: "\(answer)")
    }
}

struct CoachIntent: AppIntent {
    static let title: LocalizedStringResource = "Coach me"
    static let description = IntentDescription("A short, personal plan for what to focus on next, from your deadlines, weights and the marks you need.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        let answer = await GradeAssistant.answer(
            "Looking at my deadlines, their weights and the marks I need, what should I focus on over the next week or two? Prioritise, and be specific to my subjects.",
            fallback: { s in [s.dueText, s.targetText].joined(separator: " ") })
        return .result(value: answer, dialog: "\(answer)", view: DeadlinesSnippet(summary: GradeSummary.load()))
    }
}

/// Answers free-form questions with Apple's on-device model, primed with the record, the chosen style,
/// what the student wrote about themselves and the recent conversation. Falls back to a plain summary
/// where Apple Intelligence is off or unsupported.
enum GradeAssistant {
    static func answer(_ question: String, fallback: ((GradeSummary) -> String)? = nil) async -> String {
        guard let s = GradeSummary.load() else { return noData }
        let plain = fallback?(s) ?? s.overviewText
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let model = SystemLanguageModel.default
            guard case .available = model.availability else {
                if case .unavailable(.appleIntelligenceNotEnabled) = model.availability {
                    return "Turn on Apple Intelligence in Settings for tailored answers. For now: " + plain
                }
                if case .unavailable(.modelNotReady) = model.availability {
                    return "Apple Intelligence is still getting ready on this iPhone. For now: " + plain
                }
                return plain
            }
            let memory = AssistantMemory.context
            let prompt = "Student record:\n\(s.modelContext)\n\n" + (memory.isEmpty ? "" : memory + "\n\n") + "Question: \(question)"
            do {
                let session = LanguageModelSession(instructions: s.modelInstructions)
                let reply = try await session.respond(to: prompt).content.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !reply.isEmpty else { return plain }
                AssistantMemory.remember(question: question, answer: reply)
                for e in SubjectEntity.all() where question.localizedCaseInsensitiveContains(e.id) || (!e.name.isEmpty && question.localizedCaseInsensitiveContains(e.name)) {
                    AssistantMemory.noteSubject(e.id)
                }
                return reply
            } catch {
                return "I couldn't work that out just now. " + plain
            }
        }
        #endif
        return plain
    }
}

// MARK: - Siri phrases

struct GPAWAMShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: WAMIntent(), phrases: [
            "What's my WAM in \(.applicationName)", "Check my WAM with \(.applicationName)", "What is my WAM on \(.applicationName)",
            "\(.applicationName) WAM", "How's my WAM in \(.applicationName)",
        ], shortTitle: "My WAM", systemImageName: "graduationcap")
        AppShortcut(intent: GPAIntent(), phrases: [
            "What's my GPA in \(.applicationName)", "Check my GPA with \(.applicationName)", "What is my GPA on \(.applicationName)", "\(.applicationName) GPA",
        ], shortTitle: "My GPA", systemImageName: "chart.bar")
        AppShortcut(intent: GradeSummaryIntent(), phrases: [
            "How are my grades in \(.applicationName)", "How am I going in \(.applicationName)", "Grade summary from \(.applicationName)", "\(.applicationName) summary",
        ], shortTitle: "Grade summary", systemImageName: "list.bullet.rectangle")
        AppShortcut(intent: NextDueIntent(), phrases: [
            "What's due next in \(.applicationName)", "What assignments are due in \(.applicationName)", "Upcoming deadlines in \(.applicationName)", "What's due in \(.applicationName)",
        ], shortTitle: "What's due", systemImageName: "calendar")
        AppShortcut(intent: SubjectIntent(), phrases: [
            "What's my mark in \(\.$subject) in \(.applicationName)", "How am I going in \(\.$subject) in \(.applicationName)",
            "What do I need in \(\.$subject) in \(.applicationName)", "Check \(\.$subject) in \(.applicationName)",
        ], shortTitle: "Check a subject", systemImageName: "book")
        AppShortcut(intent: TargetIntent(), phrases: [
            "Am I on track in \(.applicationName)", "Will I hit my target in \(.applicationName)", "What do I need for my target in \(.applicationName)",
        ], shortTitle: "My target", systemImageName: "target")
        AppShortcut(intent: CoachIntent(), phrases: [
            "Coach me with \(.applicationName)", "What should I focus on in \(.applicationName)", "Help me plan my study in \(.applicationName)",
        ], shortTitle: "Coach me", systemImageName: "figure.run")
        AppShortcut(intent: AskIntent(), phrases: [
            "Ask \(.applicationName) a question", "Ask \(.applicationName) about my grades", "I have a question for \(.applicationName)",
        ], shortTitle: "Ask about my grades", systemImageName: "sparkles")
        AppShortcut(intent: OpenPageIntent(), phrases: [
            "Open \(\.$page) in \(.applicationName)", "Show my \(\.$page) in \(.applicationName)", "Open \(.applicationName) \(\.$page)",
        ], shortTitle: "Open a page", systemImageName: "rectangle.portrait.on.rectangle.portrait")
    }
}

// MARK: - Snippets shown with Siri's answer

struct SummarySnippet: View {
    let summary: GradeSummary?

    var body: some View {
        if let s = summary, s.hasMarks {
            HStack(alignment: .top, spacing: 20) {
                metric("WAM", s.wam.map { $0.dp(2) } ?? "–", s.grade ?? "")
                metric("GPA", s.gpa.map { $0.dp(3) } ?? "–", "of \((s.maxGPA ?? 7).short)")
                metric("Credit points", (s.cp ?? 0).short, "of \((s.totalCP ?? 0).short)")
            }
            .padding()
        } else {
            Text(noData).font(.callout).padding()
        }
    }

    private func metric(_ label: String, _ value: String, _ note: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            Text(value).font(.title2.weight(.bold)).foregroundStyle(burgundy)
            if !note.isEmpty { Text(note).font(.caption).foregroundStyle(.secondary) }
        }
    }
}

struct DeadlinesSnippet: View {
    let summary: GradeSummary?

    var body: some View {
        let list = Array((summary?.upcoming ?? []).prefix(5))
        if list.isEmpty {
            Text("Nothing with a due date is coming up.").font(.callout).padding()
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(list.indices, id: \.self) { i in
                    let d = list[i]
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(d.name ?? "Assessment").font(.subheadline.weight(.semibold)).lineLimit(1)
                            Text([d.code, d.weight.map { "\($0.short)%" }].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(dueLabel(d.days)).font(.caption.weight(.bold)).foregroundStyle((d.days ?? 99) <= 3 ? burgundy : .secondary)
                    }
                }
            }
            .padding()
        }
    }

    private func dueLabel(_ days: Double?) -> String {
        switch Int(days ?? -1) {
        case 0: return "Today"
        case 1: return "Tomorrow"
        case let d where d > 1: return "\(d) days"
        default: return ""
        }
    }
}
