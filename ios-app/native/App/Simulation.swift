import Foundation

/// What Siri needs to rerun the calculator's maths for a what-if, exported by simData in assets/js/native.js.
/// It mirrors assets/js/engine.js: WAM = Σ mark × CP ÷ Σ CP and GPA = Σ grade points × CP ÷ Σ CP over counted
/// subjects, so a what-if swaps one subject's current contribution for the new one. Foundation only, so CI can
/// check it against the web engine with plain swiftc.
struct SimData: Codable {
    struct Band: Codable { var min: Double; var max: Double; var grade: String; var gp: Double? }
    struct Cls: Codable { var name: String; var min: Double }
    struct Item: Codable { var id: String; var name: String; var weight: Double? }
    struct Subject: Codable {
        var code: String; var name: String?; var cp: Double; var status: String?; var mark: Double?
        var qp: Double?; var cpc: Double?; var gpc: Double?; var manual: Bool?
        var contrib: Double?; var wdone: Double?; var bonus: Double?; var open: [Item]?
    }

    var qp: Double; var cpc: Double; var gpc: Double; var cpToWAM: Double; var passMark: Double?
    var bands: [Band]; var classes: [Cls]; var subjects: [Subject]
}

/// A record's headline numbers, before or after a what-if.
struct SimTotals {
    var qp: Double, cpc: Double, gpc: Double, cpToWAM: Double
    var wam: Double? { cpc > 0 ? qp / cpc : nil }
    var gpa: Double? { cpc > 0 ? gpc / cpc : nil }
}

/// One change Siri tried, also handed to the web app when it is set up in the sandbox.
struct ScenarioChange: Codable {
    var kind: String          // "subject" or "assessment"
    var code: String
    var id: String?           // the assessment's id
    var mark: Double
    var label: String         // for the web app's confirmation, e.g. "ACCT3001 on 85"
}

extension SimData {
    var totals: SimTotals { SimTotals(qp: qp, cpc: cpc, gpc: gpc, cpToWAM: cpToWAM) }
    var pass: Double { passMark ?? 50 }

    func band(_ mark: Double) -> Band? {
        let r = (mark * 100).rounded() / 100
        return bands.first { r >= $0.min && r <= $0.max }
    }

    func className(_ wam: Double) -> String? { classes.first { wam >= $0.min }?.name ?? classes.last?.name }

    /// Finds a subject from its code or words from its name, preferring one that is still to finish.
    func subject(_ query: String) -> Subject? {
        let q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let compact = q.replacingOccurrences(of: " ", with: "")
        guard !q.isEmpty else { return nil }
        let pick: ([Subject]) -> Subject? = { list in list.first { $0.status != "Completed" && $0.status != "Failed" } ?? list.last }
        let name: (Subject) -> String = { ($0.name ?? "").lowercased() }
        if let s = pick(subjects.filter { $0.code.lowercased() == compact }) { return s }
        if let s = pick(subjects.filter { name($0) == q }) { return s }
        if let s = pick(subjects.filter { !name($0).isEmpty && (name($0).contains(q) || q.contains(name($0))) }) { return s }
        if compact.count >= 4, let s = pick(subjects.filter { $0.code.lowercased().contains(compact) }) { return s }
        let words = Set(q.split { !$0.isLetter && !$0.isNumber }.map(String.init).filter { $0.count >= 4 })
        let scored = subjects.map { s in (s, words.intersection(Set(name(s).split { !$0.isLetter && !$0.isNumber }.map(String.init))).count) }
        let best = scored.map { $0.1 }.max() ?? 0
        return best > 0 ? pick(scored.filter { $0.1 == best }.map { $0.0 }) : nil
    }

    /// Finds an open assessment in a subject by name; with only one open, that one.
    func item(_ query: String, in s: Subject) -> Item? {
        let open = s.open ?? [], q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if let i = open.first(where: { $0.name.lowercased() == q }) { return i }
        if !q.isEmpty, let i = open.first(where: { $0.name.lowercased().contains(q) || q.contains($0.name.lowercased()) }) { return i }
        let words = Set(q.split { !$0.isLetter }.map(String.init).filter { $0.count >= 4 })
        if let i = open.first(where: { !words.isDisjoint(with: Set($0.name.lowercased().split { !$0.isLetter }.map(String.init))) }) { return i }
        return open.count == 1 ? open[0] : nil
    }

    /// The totals once the given subjects finish on the given marks.
    func finishing(_ changes: [(Subject, Double)]) -> SimTotals {
        var t = totals
        for (s, raw) in changes {
            let m = Swift.min(100, Swift.max(0, raw))
            t.qp += m * s.cp - (s.qp ?? 0)
            t.cpc += s.cp - (s.cpc ?? 0)
            t.gpc += (band(m)?.gp ?? 0) * s.cp - (s.gpc ?? 0)
            let done = s.status == "Completed", countedIP = s.status == "In Progress" && (s.cpc ?? 0) > 0
            if !done && !countedIP && m >= pass { t.cpToWAM = Swift.max(0, t.cpToWAM - s.cp) }
            if done && m < pass { t.cpToWAM += s.cp }
        }
        return t
    }

    /// The subject's running average once one more assessment is marked, and the totals if that average counts now.
    func marking(_ item: Item, in s: Subject, mark raw: Double) -> (average: Double, totals: SimTotals)? {
        guard let w = item.weight, w > 0 else { return nil }
        let m = Swift.min(100, Swift.max(0, raw))
        let wd = (s.wdone ?? 0) + w
        let avg = Swift.min(100, ((s.contrib ?? 0) + m / 100 * w) / wd * 100 + (s.bonus ?? 0))
        var t = totals
        if (s.cpc ?? 0) > 0 && s.manual != true {   // in-progress marks count towards the WAM only if Settings says so
            t.qp += avg * s.cp - (s.qp ?? 0)
            t.gpc += (band(avg)?.gp ?? 0) * s.cp - (s.gpc ?? 0)
        }
        return (avg, t)
    }

    /// The subject's final mark if everything still open scores `mark`.
    func finalMark(of s: Subject, restAt raw: Double) -> Double? {
        let m = Swift.min(100, Swift.max(0, raw))
        let rest = (s.open ?? []).compactMap { $0.weight }.reduce(0, +)
        let wd = (s.wdone ?? 0) + rest
        guard wd > 0 else { return nil }
        return Swift.min(100, ((s.contrib ?? 0) + m / 100 * rest) / wd * 100 + (s.bonus ?? 0))
    }

    /// The totals if every remaining credit point averages `avg` (the planner's scenario maths).
    func averaging(_ raw: Double) -> SimTotals? {
        guard cpToWAM > 0 else { return nil }
        let avg = Swift.min(100, Swift.max(0, raw))
        return SimTotals(qp: qp + avg * cpToWAM, cpc: cpc + cpToWAM, gpc: gpc + (band(avg)?.gp ?? 0) * cpToWAM, cpToWAM: 0)
    }

    /// The final mark in one subject that brings the WAM to `target`, with everything else as it stands.
    func markNeeded(in s: Subject, forWAM target: Double) -> Double {
        (target * (cpc - (s.cpc ?? 0) + s.cp) - (qp - (s.qp ?? 0))) / s.cp
    }

    /// The lowest grade band in one subject that brings the GPA to `target`.
    func bandNeeded(in s: Subject, forGPA target: Double) -> Band? {
        bands.sorted { $0.min < $1.min }.first { b in
            ((gpc - (s.gpc ?? 0)) + (b.gp ?? 0) * s.cp) / (cpc - (s.cpc ?? 0) + s.cp) >= target - 1e-9
        }
    }

    func needAverage(_ t: SimTotals, target: Double) -> Double? {
        t.cpToWAM > 0 ? (target * (t.cpc + t.cpToWAM) - t.qp) / t.cpToWAM : nil
    }

    func label(_ s: Subject) -> String {
        let n = (s.name ?? "").trimmingCharacters(in: .whitespaces)
        return n.isEmpty ? s.code : "\(s.code) \(n)"
    }

    var stillToFinish: [Subject] { subjects.filter { $0.status != "Completed" && $0.status != "Failed" } }
}

// MARK: - What Siri says about a what-if

/// A finished what-if: what Siri says, the numbers for the card, and the changes to set up in the sandbox.
struct SimResult {
    var text: String
    var title: String
    var before: SimTotals?
    var after: SimTotals?
    var changes: [ScenarioChange] = []
    var ok: Bool { after != nil }
}

private func change(_ word: String, _ from: Double?, _ to: Double?, places: Int) -> String? {
    guard let a = from, let b = to else { return nil }
    let d = b - a
    if abs(d) < 0.5 / pow(10, Double(places)) { return "your \(word) stays at \(b.dp(places))" }
    return "your \(word) goes from \(a.dp(places)) to \(b.dp(places)), \(d > 0 ? "up" : "down") \(abs(d).dp(places))"
}

extension GradeSummary {
    private var noSim: SimResult { SimResult(text: "Open GPA & WAM once so Siri has your latest record to simulate with.", title: "What-if") }

    private func gradePhrase(_ sim: SimData, _ mark: Double) -> String {
        sim.band(mark).map { b in " (\(withArticle(b.grade)))" } ?? ""
    }

    private func notFound(_ sim: SimData, _ query: String) -> SimResult {
        let open = sim.stillToFinish.prefix(6).map { sim.label($0) }
        let list = open.isEmpty ? "" : " Subjects still to finish: \(open.joined(separator: ", "))."
        return SimResult(text: "I couldn't find a subject matching \"\(query)\".\(list)", title: "What-if")
    }

    /// How the record moves from `before` to `after`: WAM, GPA, classification and the average still needed.
    private func consequences(_ sim: SimData, _ before: SimTotals, _ after: SimTotals) -> String {
        let parts = [change("WAM", before.wam, after.wam, places: 2), change("GPA", before.gpa, after.gpa, places: 3)].compactMap { $0 }
        var out = parts.isEmpty ? "" : sentenceCase(parts.joined(separator: ", and ")) + "."
        if let a = after.wam, let now = sim.className(a) {
            let was = before.wam.flatMap { sim.className($0) }
            out += was == nil || was == now ? " You'd be in \(now)." : " That moves you from \(was!) to \(now)."
        }
        if let target = targetWAM, after.cpToWAM > 0, let need = sim.needAverage(after, target: target) {
            let was = sim.needAverage(before, target: target)
            let left = after.cpToWAM.short
            if need > 100 { out += " Your \(target.short) target would then be out of reach." }
            else if need <= sim.pass { out += " Your \(target.short) target would then be safe with passes from here." }
            else { out += " You'd then need to average \(need.dp(1)) across your last \(left) credit points for your \(target.short) target" + (was.map { $0 > 100 ? ", which is within reach again." : ", \(need < $0 ? "down" : "up") from \($0.dp(1))." } ?? ".") }
        } else if let target = targetWAM, let a = after.wam, after.cpToWAM <= 0 {
            out += a >= target ? " That finishes you above your \(target.short) target." : " That finishes you below your \(target.short) target."
        }
        if style == "encouraging", let target = targetWAM, let a = after.wam, let b = before.wam, a >= target, b < target {
            out += firstName.map { " That's the target, \($0)!" } ?? " That's your target!"
        }
        return out.trimmingCharacters(in: .whitespaces)
    }

    /// "What if I finish these subjects on these marks?"
    func whatIf(_ requests: [(subject: String, mark: Double)]) -> SimResult {
        guard let sim = sim else { return noSim }
        var found: [(SimData.Subject, Double)] = []
        for r in requests {
            guard let s = sim.subject(r.subject) else { return notFound(sim, r.subject) }
            found.append((s, Swift.min(100, Swift.max(0, r.mark))))
        }
        guard !found.isEmpty else { return SimResult(text: "Tell me a subject and a mark to try.", title: "What-if") }
        let before = sim.totals, after = sim.finishing(found)
        let lead = found.map { "\($0.0.code) on \($0.1.short)\(gradePhrase(sim, $0.1))" }
        let result = consequences(sim, before, after)
        let text = "If you finish \(list(lead)), " + result.prefix(1).lowercased() + result.dropFirst()
        let changes = found.map { ScenarioChange(kind: "subject", code: $0.0.code, id: nil, mark: $0.1, label: "\($0.0.code) on \($0.1.short)") }
        return SimResult(text: text, title: found.count == 1 ? "\(found[0].0.code) on \(found[0].1.short)" : "What-if", before: before, after: after, changes: changes)
    }

    /// "What if I get this mark on that assessment?"
    func whatIf(subject query: String, assessment name: String, mark raw: Double) -> SimResult {
        guard let sim = sim else { return noSim }
        guard let s = sim.subject(query) else { return notFound(sim, query) }
        let mark = Swift.min(100, Swift.max(0, raw))
        let open = s.open ?? []
        guard !open.isEmpty else { return SimResult(text: "\(s.code) has no ungraded assessments in the app, so there is nothing to try a mark on.", title: s.code) }
        guard let item = sim.item(name, in: s), let r = sim.marking(item, in: s, mark: mark) else {
            return SimResult(text: "I couldn't find \"\(name)\" in \(s.code). Its open assessments are \(list(open.map { $0.name })).", title: s.code)
        }
        let before = sim.totals
        var text = "If you get \(mark.short) on the \(s.code) \(item.name)"
        if let w = item.weight { text += ", worth \(w.short)%" }
        let now = s.mark.map { " from \($0.dp(1))" } ?? ""
        text += ", your average in \(s.code) goes\(now) to \(r.average.dp(1))\(gradePhrase(sim, r.average))."
        if (s.cpc ?? 0) > 0 && s.manual != true, let line = change("WAM", before.wam, r.totals.wam, places: 2) { text += " " + sentenceCase(line) + "." }
        let others = open.filter { $0.id != item.id }
        if !others.isEmpty, let fin = sim.finalMark(of: s, restAt: mark) {
            let after = sim.finishing([(s, fin)])
            text += " Scoring \(mark.short) on the rest too would finish \(s.code) on \(fin.dp(1))\(gradePhrase(sim, fin))" + (after.wam.map { ", for a WAM of \($0.dp(2))." } ?? ".")
            return SimResult(text: text, title: "\(s.code) \(item.name)", before: before, after: after,
                             changes: [ScenarioChange(kind: "assessment", code: s.code, id: item.id, mark: mark, label: "\(s.code) \(item.name) on \(mark.short)")])
        }
        let after = sim.finishing([(s, r.average)])
        text += after.wam.map { " That would finish the subject, for a WAM of \($0.dp(2))." } ?? ""
        return SimResult(text: text, title: "\(s.code) \(item.name)", before: before, after: after,
                         changes: [ScenarioChange(kind: "assessment", code: s.code, id: item.id, mark: mark, label: "\(s.code) \(item.name) on \(mark.short)")])
    }

    /// "What if I average this across the rest of my degree?"
    func whatIf(average raw: Double) -> SimResult {
        guard let sim = sim else { return noSim }
        let avg = Swift.min(100, Swift.max(0, raw))
        guard let after = sim.averaging(avg) else { return SimResult(text: "There are no credit points left to count, so your WAM is final.", title: "Rest of degree") }
        var text = "If you average \(avg.short)\(gradePhrase(sim, avg)) across your last \(sim.cpToWAM.short) credit points, you'd finish with a WAM of \((after.wam ?? 0).dp(2)) and a GPA of \((after.gpa ?? 0).dp(3))"
        if let c = after.wam.flatMap({ sim.className($0) }) { text += ", in \(c)" }
        text += "."
        if let t = targetWAM, let w = after.wam { text += w >= t ? " That beats your \(t.short) target." : " That's \((t - w).dp(2)) short of your \(t.short) target." }
        return SimResult(text: text, title: "Average \(avg.short) from here", before: sim.totals, after: after)
    }

    /// "What do I need in this subject to get my WAM (or GPA) to the target?"
    func needed(in query: String, wam: Double? = nil, gpa: Double? = nil) -> SimResult {
        guard let sim = sim else { return noSim }
        guard let s = sim.subject(query) else { return notFound(sim, query) }
        var lines: [String] = []
        var best: Double? = nil
        if let target = wam ?? (gpa == nil ? targetWAM : nil) {
            let need = sim.markNeeded(in: s, forWAM: target)
            if need > 100 {
                let top = sim.finishing([(s, 100)]).wam ?? 0
                lines.append("Even 100 in \(s.code) only takes your WAM to \(top.dp(2)), so reaching \(target.short) needs your other subjects too.")
            } else if need <= 0 {
                lines.append("Your WAM stays at \(target.short) or above whatever you get in \(s.code).")
            } else {
                best = need
                lines.append("You need at least \(need.dp(1))\(gradePhrase(sim, need)) in \(s.code) to bring your WAM to \(target.short), with your other subjects as they stand.")
            }
        }
        if let target = gpa ?? (wam == nil ? targetGPA : nil) {
            if let b = sim.bandNeeded(in: s, forGPA: target) {
                lines.append(b.min <= sim.pass - 1e-9 ? "Your GPA stays at \(target.short) or above whatever you get in \(s.code)." : "For a GPA of \(target.short), you need at least \(withArticle(b.grade)) (\(b.min.short) or more) in \(s.code).")
            } else {
                lines.append("Even an HD in \(s.code) won't lift your GPA to \(target.short) on its own.")
            }
        }
        if lines.isEmpty { lines.append("Set a target WAM or GPA in the app first, or tell me the target to aim for.") }
        let after = best.map { sim.finishing([(s, $0)]) }
        return SimResult(text: lines.joined(separator: " "), title: "What \(s.code) needs", before: sim.totals, after: after,
                         changes: best.map { [ScenarioChange(kind: "subject", code: s.code, id: nil, mark: ($0 * 10).rounded(.up) / 10, label: "\(s.code) on \((($0 * 10).rounded(.up) / 10).short)")] } ?? [])
    }
}

private func list(_ items: [String]) -> String {
    switch items.count {
    case 0: return ""
    case 1: return items[0]
    default: return items.dropLast().joined(separator: ", ") + " and " + items.last!
    }
}

private func sentenceCase(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

// MARK: - Sandbox hand-off

extension GradeSummary {
    /// Turns spoken subjects and assessments into changes the web app can apply in its sandbox.
    func sandbox(subjects: [(subject: String, mark: Double)], assessments: [(subject: String, assessment: String, mark: Double)]) -> SimResult {
        guard let sim = sim else { return SimResult(text: "Open GPA & WAM once so Siri has your latest record.", title: "Sandbox") }
        var changes: [ScenarioChange] = [], missed: [String] = []
        for r in subjects {
            guard let s = sim.subject(r.subject) else { missed.append(r.subject); continue }
            let m = Swift.min(100, Swift.max(0, r.mark))
            changes.append(ScenarioChange(kind: "subject", code: s.code, id: nil, mark: m, label: "\(s.code) on \(m.short)"))
        }
        for r in assessments {
            guard let s = sim.subject(r.subject), let item = sim.item(r.assessment, in: s) else { missed.append("\(r.assessment) in \(r.subject)"); continue }
            let m = Swift.min(100, Swift.max(0, r.mark))
            changes.append(ScenarioChange(kind: "assessment", code: s.code, id: item.id, mark: m, label: "\(s.code) \(item.name) on \(m.short)"))
        }
        var text = changes.isEmpty ? "I couldn't match anything to set up." : "Set up in the sandbox: \(list(changes.map { $0.label })). Open GPA & WAM in the next ten minutes to explore it; nothing is saved unless you keep it."
        if !missed.isEmpty { text += " I couldn't find \(list(missed))." }
        return SimResult(text: text, title: "Sandbox", changes: changes)
    }
}

/// The last what-if Siri worked out, so "Try it in the sandbox" can open it without repeating the details.
enum LastWhatIf {
    private static let key = "lastWhatIf"

    static func save(_ changes: [ScenarioChange]) {
        guard !changes.isEmpty, let data = try? JSONEncoder().encode(changes) else { return }
        UserDefaults.standard.set(["changes": data, "at": Date().timeIntervalSince1970], forKey: key)
    }

    /// The last what-if, if it was in the past ten minutes.
    static func recent() -> [ScenarioChange]? {
        guard let d = UserDefaults.standard.dictionary(forKey: key), let data = d["changes"] as? Data,
              let at = d["at"] as? Double, Date().timeIntervalSince1970 - at < 600 else { return nil }
        return try? JSONDecoder().decode([ScenarioChange].self, from: data)
    }
}
