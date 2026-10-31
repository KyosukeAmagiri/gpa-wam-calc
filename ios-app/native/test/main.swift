// CI check of what Siri says: decodes a summary made by the web app from the sample student and prints every answer.
import Foundation

let text = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
guard var s = GradeSummary.decode(text) else { print("DECODE FAILED"); exit(1) }
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
print("--- instructions ---\n\(s.modelInstructions)")
print("--- record ---\n\(s.modelContext)")
