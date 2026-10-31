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

enum Metric: String, AppEnum {
    case wam, gpa

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Measure"
    static let caseDisplayRepresentations: [Metric: DisplayRepresentation] = [.wam: "WAM", .gpa: "GPA"]
}

struct MetricIntent: AppIntent {
    static let title: LocalizedStringResource = "Get my WAM or GPA"
    static let description = IntentDescription("Tells you your WAM or GPA and how it compares with your target.")

    @Parameter(title: "Measure", default: .wam)
    var metric: Metric

    static var parameterSummary: some ParameterSummary { Summary("Get my \(\.$metric)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        let s = GradeSummary.load()
        let text = (metric == .wam ? s?.wamText : s?.gpaText) ?? noData
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

    /// Subjects still to finish first (in progress, then planned), then completed ones, newest first; one entry per code.
    static func all() -> [SubjectEntity] {
        guard let s = GradeSummary.load() else { return [] }
        var seen = Set<String>(), out: [SubjectEntity] = []
        let open = (s.sim?.stillToFinish ?? []).sorted { ($0.status == "In Progress" ? 0 : 1) < ($1.status == "In Progress" ? 0 : 1) }
        let rows = (s.current ?? []).map { ($0.code, $0.name) } + open.map { (Optional($0.code), $0.name) } + (s.done ?? []).reversed().map { ($0.code, $0.name) }
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

/// Hands a page, and optionally a what-if to set up in the sandbox, from Siri to the web app. The web app collects
/// it through WidgetBridge.takeRoute when it starts, when it comes to the front, and when MainViewController nudges it.
enum PendingRoute {
    static let key = "pendingRoute"
    static let notification = Notification.Name("GPAWAMOpenRoute")

    static func set(_ route: String, scenario: [ScenarioChange]? = nil) {
        var d: [String: Any] = ["route": route, "at": Date().timeIntervalSince1970]
        if let sc = scenario, let data = try? JSONEncoder().encode(sc) { d["scenario"] = String(data: data, encoding: .utf8) }
        UserDefaults.standard.set(d, forKey: key)
        NotificationCenter.default.post(name: notification, object: route)
    }

    /// What is waiting, if Siri asked recently (two minutes for a page, ten for a sandbox what-if); taking it clears it.
    static func take() -> (route: String, scenario: String?)? {
        guard let d = UserDefaults.standard.dictionary(forKey: key) else { return nil }
        UserDefaults.standard.removeObject(forKey: key)
        let scenario = d["scenario"] as? String
        guard let route = d["route"] as? String, let at = d["at"] as? Double,
              Date().timeIntervalSince1970 - at < (scenario == nil ? 120 : 600) else { return nil }
        return (route, scenario)
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

// MARK: - What-ifs

/// Siri's spoken answer for a what-if, with the before and after card.
private func simulated(_ r: SimResult) -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
    LastWhatIf.save(r.changes)
    return .result(value: r.text, dialog: "\(r.text)", view: SimSnippet(result: r))
}

struct WhatIfIntent: AppIntent {
    static let title: LocalizedStringResource = "What if I get a mark in a subject"
    static let description = IntentDescription("Works out your new WAM, GPA and classification if you finish a subject on a mark you choose. Nothing is saved.")

    @Parameter(title: "Subject", requestValueDialog: "Which subject?")
    var subject: SubjectEntity

    @Parameter(title: "Final mark", requestValueDialog: "What final mark should I try?")
    var mark: Double

    static var parameterSummary: some ParameterSummary { Summary("What if I finish \(\.$subject) on \(\.$mark)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        guard let s = GradeSummary.load() else { return simulated(SimResult(text: noData, title: "What-if")) }
        AssistantMemory.noteSubject(subject.id)
        return simulated(s.whatIf([(subject.id, mark)]))
    }
}

struct AssessmentWhatIfIntent: AppIntent {
    static let title: LocalizedStringResource = "What if I get a mark on an assessment"
    static let description = IntentDescription("Works out your subject average and WAM if you get a mark you choose on one assessment. Nothing is saved.")

    @Parameter(title: "Subject", requestValueDialog: "Which subject?")
    var subject: SubjectEntity

    @Parameter(title: "Assessment", requestValueDialog: "Which assessment?")
    var assessment: String

    @Parameter(title: "Mark (%)", requestValueDialog: "What mark should I try, out of 100?")
    var mark: Double

    static var parameterSummary: some ParameterSummary { Summary("What if I get \(\.$mark) on \(\.$assessment) in \(\.$subject)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        guard let s = GradeSummary.load() else { return simulated(SimResult(text: noData, title: "What-if")) }
        return simulated(s.whatIf(subject: subject.id, assessment: assessment, mark: mark))
    }
}

struct AverageWhatIfIntent: AppIntent {
    static let title: LocalizedStringResource = "What if I average a mark from here"
    static let description = IntentDescription("Your final WAM, GPA and classification if you average a mark you choose across the rest of your degree.")

    @Parameter(title: "Average", requestValueDialog: "What average should I try for the rest of your degree?")
    var average: Double

    static var parameterSummary: some ParameterSummary { Summary("What if I average \(\.$average) from here") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        guard let s = GradeSummary.load() else { return simulated(SimResult(text: noData, title: "What-if")) }
        return simulated(s.whatIf(average: average))
    }
}

struct MarkNeededIntent: AppIntent {
    static let title: LocalizedStringResource = "What do I need in a subject"
    static let description = IntentDescription("The lowest final mark in a subject that brings your WAM to a target, and the grade it needs for your GPA target.")

    @Parameter(title: "Subject", requestValueDialog: "Which subject?")
    var subject: SubjectEntity

    @Parameter(title: "Target WAM", description: "Leave empty to use the target in the app.")
    var targetWAM: Double?

    static var parameterSummary: some ParameterSummary { Summary("What I need in \(\.$subject) for a WAM of \(\.$targetWAM)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog & ShowsSnippetView {
        guard let s = GradeSummary.load() else { return simulated(SimResult(text: noData, title: "What-if")) }
        return simulated(targetWAM.map { s.needed(in: subject.id, wam: $0) } ?? s.needed(in: subject.id))
    }
}

struct SandboxWhatIfIntent: AppIntent {
    static let title: LocalizedStringResource = "Try a mark in the sandbox"
    static let description = IntentDescription("Opens the calculator in sandbox mode with a subject finished on the mark you choose, or with the what-if Siri just worked out, so you can explore every page. Nothing is saved unless you keep it.")
    static let openAppWhenRun = true

    @Parameter(title: "Subject", description: "Leave empty to use the what-if Siri just worked out.")
    var subject: SubjectEntity?

    @Parameter(title: "Final mark")
    var mark: Double?

    static var parameterSummary: some ParameterSummary { Summary("Try \(\.$subject) on \(\.$mark) in the sandbox") }

    @MainActor
    func perform() async throws -> some IntentResult {
        if subject == nil, mark == nil, let last = LastWhatIf.recent() {
            PendingRoute.set("dashboard", scenario: last)
            return .result()
        }
        guard let s = subject else {
            PendingRoute.set("dashboard", scenario: [])   // no what-if to show: just open an empty sandbox
            return .result()
        }
        var raw = mark
        if raw == nil { raw = try await $mark.requestValue("What final mark should I try in the sandbox?") }
        let m = min(100, max(0, raw ?? 0))
        PendingRoute.set("dashboard", scenario: [ScenarioChange(kind: "subject", code: s.id, id: nil, mark: m, label: "\(s.id) on \(m.short)")])
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
            // the what-if maths runs in Swift through tools, so the model reports exact numbers instead of guessing
            let tools: [any Tool] = s.sim == nil ? [] : [
                SubjectWhatIfTool(summary: s), AssessmentWhatIfTool(summary: s), AverageWhatIfTool(summary: s),
                MarkNeededTool(summary: s), SandboxTool(summary: s),
            ]
            let ask: (String) async throws -> String = { record in
                let session = LanguageModelSession(tools: tools, instructions: s.modelInstructions)
                let prompt = "Student record:\n\(record)\n\n" + (memory.isEmpty ? "" : memory + "\n\n") + "Question: \(question)"
                return try await session.respond(to: prompt).content.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            do {
                let reply: String
                do { reply = try await ask(s.modelContext) } catch { reply = try await ask(s.compactContext) } // a long record can overflow the model's context
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

#if canImport(FoundationModels)
// The what-if tools Apple Intelligence can call. Each runs the same maths as the What-if intents.

@available(iOS 26.0, *)
@Generable
struct MarkChange {
    @Guide(description: "Subject code such as ACCT3001, or words from the subject's name")
    var subject: String
    @Guide(description: "Final subject mark out of 100")
    var mark: Double
}

@available(iOS 26.0, *)
@Generable
struct AssessmentChange {
    @Guide(description: "Subject code such as ACCT3001, or words from the subject's name")
    var subject: String
    @Guide(description: "Name of the assessment, such as Final exam")
    var assessment: String
    @Guide(description: "Mark on that assessment out of 100")
    var mark: Double
}

@available(iOS 26.0, *)
struct SubjectWhatIfTool: Tool {
    let name = "simulateSubjects"
    let description = "Exact what-if maths for finishing one or more subjects on given final marks. Returns the new WAM, GPA, classification and the average still needed for the target."
    let summary: GradeSummary

    @Generable
    struct Arguments {
        @Guide(description: "Each subject to try and its final mark")
        var changes: [MarkChange]
    }

    func call(arguments: Arguments) async throws -> String {
        let r = summary.whatIf(arguments.changes.map { (subject: $0.subject, mark: $0.mark) })
        LastWhatIf.save(r.changes)
        return r.text
    }
}

@available(iOS 26.0, *)
struct AssessmentWhatIfTool: Tool {
    let name = "simulateAssessment"
    let description = "Exact what-if maths for one assessment mark: the subject's new average, what it finishes on if the rest goes the same way, and the WAM."
    let summary: GradeSummary

    @Generable
    struct Arguments {
        var change: AssessmentChange
    }

    func call(arguments: Arguments) async throws -> String {
        let r = summary.whatIf(subject: arguments.change.subject, assessment: arguments.change.assessment, mark: arguments.change.mark)
        LastWhatIf.save(r.changes)
        return r.text
    }
}

@available(iOS 26.0, *)
struct AverageWhatIfTool: Tool {
    let name = "simulateAverage"
    let description = "Exact final WAM, GPA and classification if the student averages a given mark across all the credit points they have left."
    let summary: GradeSummary

    @Generable
    struct Arguments {
        @Guide(description: "Average mark out of 100 for the rest of the degree")
        var average: Double
    }

    func call(arguments: Arguments) async throws -> String { summary.whatIf(average: arguments.average).text }
}

@available(iOS 26.0, *)
struct MarkNeededTool: Tool {
    let name = "markNeeded"
    let description = "The lowest final mark in one subject that brings the WAM to a target, and the grade it needs for the GPA target."
    let summary: GradeSummary

    @Generable
    struct Arguments {
        @Guide(description: "Subject code such as ACCT3001, or words from the subject's name")
        var subject: String
        @Guide(description: "Target WAM out of 100, or 0 to use the target saved in the app")
        var targetWAM: Double
    }

    func call(arguments: Arguments) async throws -> String {
        (arguments.targetWAM > 0 ? summary.needed(in: arguments.subject, wam: arguments.targetWAM) : summary.needed(in: arguments.subject)).text
    }
}

@available(iOS 26.0, *)
struct SandboxTool: Tool {
    let name = "setUpSandbox"
    let description = "Sets up subject or assessment marks in the app's sandbox, where the student can explore every page without saving. Use when they ask to try or see something in the sandbox."
    let summary: GradeSummary

    @Generable
    struct Arguments {
        @Guide(description: "Subjects to finish on a final mark; may be empty")
        var subjects: [MarkChange]
        @Guide(description: "Assessments to mark; may be empty")
        var assessments: [AssessmentChange]
    }

    func call(arguments: Arguments) async throws -> String {
        let r = summary.sandbox(subjects: arguments.subjects.map { (subject: $0.subject, mark: $0.mark) },
                                assessments: arguments.assessments.map { (subject: $0.subject, assessment: $0.assessment, mark: $0.mark) })
        if !r.changes.isEmpty { await MainActor.run { PendingRoute.set("dashboard", scenario: r.changes) } }
        return r.text
    }
}
#endif

// MARK: - Siri phrases

struct GPAWAMShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: MetricIntent(), phrases: [
            "What's my \(\.$metric) in \(.applicationName)", "Check my \(\.$metric) with \(.applicationName)", "What is my \(\.$metric) on \(.applicationName)",
            "\(.applicationName) \(\.$metric)", "How's my \(\.$metric) in \(.applicationName)",
        ], shortTitle: "My WAM or GPA", systemImageName: "graduationcap")
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
        AppShortcut(intent: WhatIfIntent(), phrases: [
            "Run a what-if in \(.applicationName)", "What if in \(\.$subject) with \(.applicationName)", "Simulate \(\.$subject) in \(.applicationName)",
            "Run a simulation in \(.applicationName)", "What if I change \(\.$subject) in \(.applicationName)",
        ], shortTitle: "What if", systemImageName: "function")
        AppShortcut(intent: SandboxWhatIfIntent(), phrases: [
            "Try it in the \(.applicationName) sandbox", "Try that in the \(.applicationName) sandbox", "Show it in the \(.applicationName) sandbox",
            "Open a sandbox in \(.applicationName)", "Sandbox \(\.$subject) in \(.applicationName)", "Try \(\.$subject) in the \(.applicationName) sandbox",
        ], shortTitle: "Sandbox what-if", systemImageName: "flask")
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

struct SimSnippet: View {
    let result: SimResult

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(result.title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            if let a = result.after {
                HStack(alignment: .top, spacing: 24) {
                    move("WAM", result.before?.wam, a.wam, places: 2)
                    move("GPA", result.before?.gpa, a.gpa, places: 3)
                }
            }
            if !result.changes.isEmpty {
                Text("Say \u{201C}Try it in the GPA & WAM sandbox\u{201D} to explore every page.").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    private func move(_ label: String, _ from: Double?, _ to: Double?, places: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(to.map { $0.dp(places) } ?? "–").font(.title2.weight(.bold)).foregroundStyle(burgundy)
            if let f = from, let t = to {
                let d = t - f
                Text(abs(d) < 0.5 / pow(10, Double(places)) ? "no change" : "\(d > 0 ? "▲" : "▼") \(abs(d).dp(places)) from \(f.dp(places))")
                    .font(.caption).foregroundStyle(d < 0 ? .red : .secondary)
            }
        }
    }
}
