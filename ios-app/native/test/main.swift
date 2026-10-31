// CI check of what Siri says and simulates: decodes the summary the web app made for the sample student,
// prints every spoken answer, and checks each what-if against the web engine's own numbers (sim-expected.json).
// Fixtures come from make-sample.mjs.
import Foundation

let args = CommandLine.arguments
let text = try String(contentsOfFile: args[1], encoding: .utf8)
guard var s = GradeSummary.decode(text), let sim = s.sim else { print("DECODE FAILED"); exit(1) }

for style in ["encouraging", "direct", "detailed"] {
    s.persona?.style = style
    print("[\(style)] \(s.wamText)")
    print("[\(style)] \(s.gpaText)")
}
s.persona?.style = "encouraging"
print("Overview: \(s.overviewText)")
print("Target: \(s.targetText)")
print("Due: \(s.dueText)")
for c in s.current ?? [] { print("Subject: \(s.subjectText(code: c.code ?? ""))") }
if let d = s.done?.last { print("Done: \(s.subjectText(code: d.code ?? ""))") }
print("Unknown: \(s.subjectText(code: "XXXX0000"))")

// MARK: what-ifs against the web engine

struct Expected: Decodable {
    var kind: String
    var changes: [[Value]]?
    var code: String?; var item: String?; var mark: Double?; var average: Double?; var target: Double?
    var wam: Double?; var gpa: Double?; var cpToWAM: Double?; var needAvg: Double?
    enum Value: Decodable {
        case text(String), number(Double)
        init(from d: Decoder) throws {
            let c = try d.singleValueContainer()
            if let n = try? c.decode(Double.self) { self = .number(n) } else { self = .text(try c.decode(String.self)) }
        }
        var text: String { if case .text(let t) = self { return t }; return "" }
        var number: Double { if case .number(let n) = self { return n }; return .nan }
    }
}

var failures = 0
func check(_ label: String, _ got: Double?, _ want: Double?) {
    guard let w = want else { return }
    let ok = got.map { abs($0 - w) < 0.005 } ?? false
    if !ok { failures += 1 }
    print("  \(ok ? "ok  " : "FAIL") \(label): siri \(got.map { String(format: "%.4f", $0) } ?? "nil"), web \(String(format: "%.4f", w))")
}
func checkTotals(_ t: SimTotals?, _ e: Expected) {
    check("WAM", t?.wam, e.wam)
    check("GPA", t?.gpa, e.gpa)
    check("CP left", t?.cpToWAM, e.cpToWAM)
    if let t = t, let target = s.targetWAM { check("average needed", sim.needAverage(t, target: target), e.needAvg) }
}

let cases = try JSONDecoder().decode([Expected].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
for e in cases {
    switch e.kind {
    case "subjects":
        let req = (e.changes ?? []).map { (subject: $0[0].text, mark: $0[1].number) }
        let r = s.whatIf(req)
        print("What if \(req.map { "\($0.subject) \($0.mark)" }.joined(separator: ", ")): \(r.text)")
        checkTotals(r.after, e)
    case "assessment":
        let r = s.whatIf(subject: e.code ?? "", assessment: e.item ?? "", mark: e.mark ?? 0)
        print("What if \(e.item ?? "") in \(e.code ?? "") on \(e.mark ?? 0): \(r.text)")
        if let subj = sim.subject(e.code ?? ""), let item = sim.item(e.item ?? "", in: subj) {
            check("subject average", sim.marking(item, in: subj, mark: e.mark ?? 0)?.average, e.average)
        } else { failures += 1; print("  FAIL could not find the assessment") }
        checkTotals(r.after, e)
    case "average":
        let r = s.whatIf(average: e.average ?? 0)
        print("What if I average \(e.average ?? 0): \(r.text)")
        check("WAM", r.after?.wam, e.wam)
        check("GPA", r.after?.gpa, e.gpa)
    case "needed":
        let r = s.needed(in: e.code ?? "", wam: e.target)
        print("What do I need in \(e.code ?? "") for \(e.target ?? 0): \(r.text)")
        check("mark needed", sim.subject(e.code ?? "").map { sim.markNeeded(in: $0, forWAM: e.target ?? 0) }, e.mark)
    default:
        break
    }
}

// spoken-only paths with no web counterpart
print("By name: \(s.whatIf([(subject: "acct3001", mark: 92)]).text)")
print("Not found: \(s.whatIf([(subject: "underwater basket weaving", mark: 80)]).text)")
print("GPA target: \(s.needed(in: "ACCT3001", gpa: 6).text)")
print("Sandbox: \(s.sandbox(subjects: [(subject: "ACCT3001", mark: 85)], assessments: [(subject: "FINC3014", assessment: "presentation", mark: 90)]).text)")

print("--- instructions ---\n\(s.modelInstructions)")
print("--- record ---\n\(s.modelContext)")
print(failures == 0 ? "ALL WHAT-IF CHECKS MATCH THE WEB ENGINE" : "\(failures) WHAT-IF CHECK(S) FAILED")
exit(failures == 0 ? 0 : 1)
