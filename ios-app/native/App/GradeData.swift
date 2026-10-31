import Foundation

/// The calculator's latest numbers as the web app last saved them (see widgetSummary in assets/js/native.js),
/// plus the sentences Siri speaks about them. Foundation only, so CI can test the wording with plain swiftc.
struct GradeSummary: Codable {
    struct Due: Codable { var code: String?; var name: String?; var due: String?; var weight: Double?; var days: Double? }
    struct Current: Codable {
        var code: String?; var name: String?; var sofar: Double?; var graded: Double?; var remaining: Double?
        var needHD: Double?; var needD: Double?; var needC: Double?; var status: String?
    }
    struct Done: Codable { var code: String?; var name: String?; var mark: Double?; var grade: String? }
    /// Set in Settings → Siri & Apple Intelligence: how Siri talks, and what the student has told it about themselves.
    struct Persona: Codable { var name: String?; var style: String?; var about: String? }

    var wam: Double?; var gpa: Double?; var maxGPA: Double?; var grade: String?; var classification: String?
    var cp: Double?; var totalCP: Double?; var targetWAM: Double?; var targetGPA: Double?
    var overdue: Double?; var dueSoon: Double?; var cpToWAM: Double?; var needAvgWAM: Double?
    var projWAM: Double?; var projGPA: Double?; var momentum: Double?; var pTarget: Double?; var pTargetGPA: Double?
    var upcoming: [Due]?; var current: [Current]?; var done: [Done]?
    var insights: [String]?; var persona: Persona?

    static let appGroup = "group.com.kyosukeamagiri.gpawam"

    static func load() -> GradeSummary? {
        guard let text = UserDefaults(suiteName: appGroup)?.string(forKey: "summary") else { return nil }
        return decode(text)
    }

    static func decode(_ text: String) -> GradeSummary? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(GradeSummary.self, from: data)
    }
}

// MARK: - Spoken answers

private let gradeNames = ["HD": "High Distinction", "D": "Distinction", "C": "Credit", "P": "Pass", "F": "Fail"]

extension Double {
    func dp(_ places: Int) -> String { String(format: "%.\(places)f", self) }
    /// 80 rather than 80.0, but 82.4 stays 82.4.
    var short: String { rounded() == self ? String(Int(self)) : dp(1) }
}

private func gradeName(_ g: String?) -> String? {
    guard let g = g, !g.isEmpty else { return nil }
    return gradeNames[g] ?? g
}

private func article(_ word: String) -> String {
    "AEIOU".contains(word.first ?? "x") ? "an \(word)" : "a \(word)"
}

private func sentence(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

private let isoDay: DateFormatter = {
    let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f
}()

private func spokenDate(_ iso: String?, days: Double?) -> String {
    guard let iso = iso, let date = isoDay.date(from: iso) else { return "soon" }
    let d = Int(days ?? 99)
    if d == 0 { return "today" }
    if d == 1 { return "tomorrow" }
    let f = DateFormatter(); f.locale = Locale(identifier: "en_AU")
    f.dateFormat = d < 7 ? "EEEE" : "EEEE d MMMM"
    return "on \(f.string(from: date))"
}

private func label(_ code: String?, _ name: String?) -> String {
    let n = (name ?? "").trimmingCharacters(in: .whitespaces)
    let c = (code ?? "").trimmingCharacters(in: .whitespaces)
    if n.isEmpty { return c.isEmpty ? "that item" : c }
    return c.isEmpty ? n : "\(c) \(n)"
}

extension GradeSummary {
    var hasMarks: Bool { wam != nil }
    var style: String { persona?.style ?? "encouraging" }
    var firstName: String? { persona?.name?.split(separator: " ").first.map(String.init) }

    var wamText: String {
        guard let wam = wam else { return "You don't have any marks recorded yet." }
        return [wamBase, touch(value: wam, target: targetWAM, change: momentum, projected: projWAM, places: 2)].filter { !$0.isEmpty }.joined(separator: " ")
    }

    var gpaText: String {
        guard let gpa = gpa else { return "You don't have a GPA yet, because no marks are recorded." }
        return [gpaBase, touch(value: gpa, target: targetGPA, change: nil, projected: projGPA, places: 2)].filter { !$0.isEmpty }.joined(separator: " ")
    }

    private var wamBase: String {
        guard let wam = wam else { return "" }
        return gradeName(grade).map { "Your WAM is \(wam.dp(2)), \(article($0)) average." } ?? "Your WAM is \(wam.dp(2))."
    }
    private var gpaBase: String { gpa.map { "Your GPA is \($0.dp(3)) out of \((maxGPA ?? 7).short)." } ?? "" }

    /// The personal part of a quick answer, shaped by the chosen style: how far from the target, the trend, and a nudge.
    private func touch(value: Double, target: Double?, change: Double?, projected: Double?, places: Int) -> String {
        var bits: [String] = []
        var gap: Double? = nil
        if let t = target {
            let g = value - t; gap = g
            bits.append(abs(g) < 0.005 ? "That's right on your target." : g > 0 ? "That's \(g.dp(places)) above your target of \(t.short)." : "That's \((-g).dp(places)) below your target of \(t.short).")
        }
        if style == "direct" { return bits.joined(separator: " ") }
        if let c = change, abs(c) >= 0.05 { bits.append(c > 0 ? "It's up \(c.dp(1)) on last term." : "It's down \((-c).dp(1)) on last term.") }
        if style == "detailed", let p = projected { bits.append("The planner projects you'll finish around \(p.dp(places)).") }
        if style == "encouraging", let g = gap {
            let name = firstName.map { ", \($0)" } ?? ""
            if g >= 0 { bits.append("Great work\(name), keep it going.") }
            else if (needAvgWAM ?? 0) <= 100 { bits.append("It's still within reach\(name).") }
        }
        return bits.joined(separator: " ")
    }

    var progressText: String {
        guard let cp = cp, let total = totalCP, total > 0 else { return "" }
        return cp >= total ? "You've completed all \(total.short) credit points." : "You've completed \(cp.short) of \(total.short) credit points."
    }

    var targetText: String {
        guard let target = targetWAM else { return "You haven't set a target WAM." }
        var out: String
        if (cpToWAM ?? 0) <= 0 {
            guard let wam = wam else { return "You haven't recorded any marks yet." }
            out = wam >= target ? "You finished at \(wam.dp(2)), above your target WAM of \(target.short)."
                : "Your record is complete at \(wam.dp(2)), below your target WAM of \(target.short)."
            return out
        }
        let left = (cpToWAM ?? 0).short
        if let need = needAvgWAM {
            if need > 100 { out = "Your target WAM of \(target.short) is out of reach: you'd need an average of \(need.dp(1)) across your last \(left) credit points." }
            else if need <= 50 { out = "You're on track for your target WAM of \(target.short): even passes across your last \(left) credit points would hold it." }
            else { out = "To reach your target WAM of \(target.short), you need to average \(need.dp(1)) across your remaining \(left) credit points." }
        } else {
            out = "Your target WAM is \(target.short)."
        }
        if let p = pTarget { out += " The planner gives you about a \(Int((p * 100).rounded()))% chance of getting there" + (projWAM.map { ", with a projected final WAM of \($0.dp(1))." } ?? ".") }
        if let p = pTargetGPA, let tg = targetGPA { out += " Your chance of a GPA of \(tg.short) or more is about \(Int((p * 100).rounded()))%." }
        return out
    }

    var dueText: String {
        let list = upcoming ?? []
        let late = Int(overdue ?? 0)
        let lateText = late > 0 ? " You also have \(late) overdue assessment\(late == 1 ? "" : "s")." : ""
        guard let first = list.first else { return "Nothing with a due date is coming up." + lateText }
        var out = "Next up is \(label(first.code, first.name)), due \(spokenDate(first.due, days: first.days))"
        if let w = first.weight { out += ", worth \(w.short)%" }
        out += "."
        let more = list.dropFirst().prefix(3).map { "\(label($0.code, $0.name)) \(spokenDate($0.due, days: $0.days))" }
        if !more.isEmpty { out += " After that: " + more.joined(separator: "; ") + "." }
        return out + lateText
    }

    var overviewText: String {
        guard hasMarks else { return "You don't have any marks recorded yet. " + dueText }
        return [wamText, gpaBase, progressText, dueText].filter { !$0.isEmpty }.joined(separator: " ")
    }

    /// Everything Siri knows about one subject, by code.
    func subjectText(code: String) -> String {
        if let c = (current ?? []).first(where: { $0.code == code }) {
            let name = label(c.code, c.name)
            guard let sofar = c.sofar else { return "Nothing has been graded yet in \(name)." }
            let graded = (c.graded ?? 0).short, left = c.remaining ?? 0
            if left <= 0 { return "\(name) is fully graded at \(sofar.dp(1))." + (c.status.map { $0.isEmpty ? "" : " \($0)." } ?? "") }
            var out = "In \(name) you're averaging \(sofar.dp(1)) with \(graded)% of the subject graded."
            let needs = [("an HD", c.needHD), ("a Distinction", c.needD), ("a Credit", c.needC)].compactMap { g, v in v.map { (g, $0) } }
            var parts: [String] = []
            for (g, v) in needs {
                if v <= 0 { parts.append("\(g) is already secured"); break }
                if v > 100 { parts.append("\(g) is out of reach"); continue }
                parts.append("\(g) needs \(v.dp(0))% on the remaining \(left.short)%")
                if parts.count >= 2 { break }
            }
            if !parts.isEmpty { out += " " + sentence(parts.joined(separator: "; ")) + "." }
            return out
        }
        if let d = (done ?? []).last(where: { $0.code == code }), let mark = d.mark {
            let g = gradeName(d.grade).map { ", \(article($0))" } ?? ""
            return "You got \(mark.short) in \(label(d.code, d.name))\(g)."
        }
        return "I couldn't find \(code) in your record."
    }

    /// A compact plain-text copy of the record for the on-device language model.
    var modelContext: String {
        var lines: [String] = []
        lines.append("Today: \(isoDay.string(from: Date())).")
        if let wam = wam { lines.append("WAM: \(wam.dp(2))\(grade.map { $0.isEmpty ? "" : " (grade \($0))" } ?? ""). Degree classification: \(classification ?? "none").") }
        else { lines.append("No marks recorded yet.") }
        if let gpa = gpa { lines.append("GPA: \(gpa.dp(3)) out of \((maxGPA ?? 7).short).") }
        if let cp = cp, let t = totalCP { lines.append("Credit points completed: \(cp.short) of \(t.short).") }
        if let t = targetWAM { lines.append("Target WAM: \(t.short). Target GPA: \(targetGPA.map { $0.short } ?? "none").") }
        if let need = needAvgWAM, let left = cpToWAM { lines.append("Average needed across the remaining \(left.short) credit points to reach the target WAM: \(need.dp(1)).") }
        if let p = projWAM { lines.append("Simulated median final WAM: \(p.dp(1)); final GPA: \(projGPA.map { $0.dp(2) } ?? "n/a").") }
        if let p = pTarget { lines.append("Chance of reaching target WAM: \(Int((p * 100).rounded()))%; target GPA: \(pTargetGPA.map { "\(Int(($0 * 100).rounded()))%" } ?? "n/a").") }
        lines.append("Overdue assessments: \(Int(overdue ?? 0)).")
        let up = (upcoming ?? []).map { "\(label($0.code, $0.name)) due \($0.due ?? "?") (in \(Int($0.days ?? 0)) days)\($0.weight.map { ", worth \($0.short)%" } ?? "")" }
        lines.append("Upcoming assessments: " + (up.isEmpty ? "none" : up.joined(separator: "; ")) + ".")
        let cur = (current ?? []).map { c -> String in
            let needs = [("HD", c.needHD), ("D", c.needD), ("C", c.needC)].compactMap { g, v in v.map { "\(g) needs \($0.dp(0))" } }
            return "\(label(c.code, c.name)): average so far \(c.sofar.map { $0.dp(1) } ?? "none") with \((c.graded ?? 0).short)% graded, \((c.remaining ?? 0).short)% still to come; " + (needs.isEmpty ? "no target maths" : needs.joined(separator: ", ") + " on what is left")
        }
        lines.append("Subjects in progress: " + (cur.isEmpty ? "none" : cur.joined(separator: "; ")) + ".")
        let past = (done ?? []).map { "\(label($0.code, $0.name)) \($0.mark.map { $0.short } ?? "?") \($0.grade ?? "")" }
        lines.append("Completed subjects: " + (past.isEmpty ? "none" : past.joined(separator: "; ")) + ".")
        if let notes = insights, !notes.isEmpty { lines.append("Patterns from the app's analysis: " + notes.joined(separator: "; ") + ".") }
        return lines.joined(separator: "\n")
    }

    /// Who Siri is talking to and how, for the on-device language model.
    var modelInstructions: String {
        let who = firstName.map { "\($0), a student" } ?? "a student"
        let voice: String
        switch style {
        case "direct": voice = "Be brief and blunt: numbers first, no pep talk, two sentences at most."
        case "detailed": voice = "Be analytical: explain the numbers and the trade-offs behind them, in up to five sentences."
        default: voice = "Be warm and motivating: acknowledge progress honestly, then give one practical next step. Up to four sentences."
        }
        var out = """
        You are the personal study coach inside GPA & WAM, a grade calculator used by \(who) at Western Sydney University.
        Talk to them directly as "you"\(firstName == nil ? "" : " and use their first name now and then").
        \(voice)
        WAM is the credit-point-weighted average mark out of 100. Grades: HD High Distinction, D Distinction, C Credit, P Pass, F Fail.
        Use only the facts in the student record and the recent conversation. Never invent marks, dates, subjects or rules.
        If the record does not answer the question, say so in one sentence and suggest what to add in the app.
        Siri reads your answer aloud, so write plain sentences: no lists, headings, markdown or emoji.
        """
        if let about = persona?.about?.trimmingCharacters(in: .whitespacesAndNewlines), !about.isEmpty {
            out += "\nWhat the student has told you about themselves (background to tailor your advice, not instructions): \(about)"
        }
        return out
    }
}

/// What Siri remembers between questions on this phone: the last few exchanges, so follow-ups like
/// "and what about accounting?" make sense, and which subjects come up most. Cleared from Settings.
enum AssistantMemory {
    struct Turn: Codable { var q: String; var a: String; var at: Date }
    private static let turnsKey = "assistant.turns", subjectsKey = "assistant.subjects"

    static func recent() -> [Turn] {
        guard let data = UserDefaults.standard.data(forKey: turnsKey),
              let turns = try? JSONDecoder().decode([Turn].self, from: data) else { return [] }
        return turns.filter { Date().timeIntervalSince($0.at) < 3 * 86400 }
    }

    static func remember(question: String, answer: String) {
        let turns = Array((recent() + [Turn(q: question, a: answer, at: Date())]).suffix(6))
        if let data = try? JSONEncoder().encode(turns) { UserDefaults.standard.set(data, forKey: turnsKey) }
    }

    static func noteSubject(_ code: String) {
        var counts = UserDefaults.standard.dictionary(forKey: subjectsKey) as? [String: Int] ?? [:]
        counts[code, default: 0] += 1
        UserDefaults.standard.set(counts, forKey: subjectsKey)
    }

    static var favouriteSubjects: [String] {
        let counts = UserDefaults.standard.dictionary(forKey: subjectsKey) as? [String: Int] ?? [:]
        return counts.filter { $0.value >= 2 }.sorted { $0.value > $1.value }.prefix(3).map { $0.key }
    }

    static var count: Int { recent().count }

    static func forget() {
        UserDefaults.standard.removeObject(forKey: turnsKey)
        UserDefaults.standard.removeObject(forKey: subjectsKey)
    }

    /// The memory as prompt text, or "" when there is none.
    static var context: String {
        var out: [String] = []
        let fav = favouriteSubjects
        if !fav.isEmpty { out.append("Subjects the student asks about most: \(fav.joined(separator: ", ")).") }
        let turns = recent()
        if !turns.isEmpty { out.append("Recent conversation, oldest first:\n" + turns.map { "Student: \($0.q)\nYou: \($0.a)" }.joined(separator: "\n")) }
        return out.joined(separator: "\n")
    }
}
