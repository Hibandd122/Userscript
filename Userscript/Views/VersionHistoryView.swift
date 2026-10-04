import SwiftUI

public struct VersionHistoryView: View {
    public let script: UserScript
    @ObservedObject var manager = ScriptManager.shared
    @Environment(\.presentationMode) var presentationMode
    @State private var selectedItem: UserScript.ScriptHistoryItem? = nil

    public init(script: UserScript) {
        self.script = script
    }

    public var body: some View {
        List {
            Section(header: Text("Current Version")) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("v\(script.version) (Active)")
                            .font(.headline)
                        Text("SHA-256: \(script.sha256Hash.prefix(12))...")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                }
            }

            Section(header: Text("Version Timeline (\(script.history.count) snapshots)")) {
                if script.history.isEmpty {
                    Text("No previous revision snapshots recorded yet. Versions are automatically captured on update.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } else {
                    ForEach(script.history) { item in
                        Button(action: { selectedItem = item }) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("v\(item.version)")
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.primary)
                                    Text(item.timestamp.formatted(date: .abbreviated, time: .shortened))
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                    if let summary = item.changeSummary {
                                        Text(summary)
                                            .font(.caption2)
                                            .foregroundColor(.blue)
                                    }
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Version Timeline")
        .sheet(item: $selectedItem) { item in
            NavigationView {
                DiffView(oldContent: item.content, newContent: script.content, oldVersion: item.version, newVersion: script.version)
            }
        }
    }
}

public struct DiffView: View {
    public let oldContent: String
    public let newContent: String
    public let oldVersion: String
    public let newVersion: String
    @Environment(\.presentationMode) var presentationMode

    public init(oldContent: String, newContent: String, oldVersion: String, newVersion: String) {
        self.oldContent = oldContent
        self.newContent = newContent
        self.oldVersion = oldVersion
        self.newVersion = newVersion
    }

    struct DiffLine: Identifiable {
        let id = UUID()
        let type: DiffType
        let text: String

        enum DiffType {
            case added, removed, same
        }
    }

    private var diffLines: [DiffLine] {
        let oldLines = oldContent.components(separatedBy: .newlines)
        let newLines = newContent.components(separatedBy: .newlines)

        var result: [DiffLine] = []
        let maxLines = max(oldLines.count, newLines.count)
        for i in 0..<min(maxLines, 200) {
            if i < oldLines.count && i < newLines.count {
                if oldLines[i] == newLines[i] {
                    result.append(DiffLine(type: .same, text: "  " + oldLines[i]))
                } else {
                    result.append(DiffLine(type: .removed, text: "- " + oldLines[i]))
                    result.append(DiffLine(type: .added, text: "+ " + newLines[i]))
                }
            } else if i < newLines.count {
                result.append(DiffLine(type: .added, text: "+ " + newLines[i]))
            } else if i < oldLines.count {
                result.append(DiffLine(type: .removed, text: "- " + oldLines[i]))
            }
        }
        return result
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(diffLines) { line in
                    Text(line.text)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(textColor(for: line.type))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 1)
                        .background(bgColor(for: line.type))
                }
            }
        }
        .navigationTitle("Diff: v\(oldVersion) → v\(newVersion)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") { presentationMode.wrappedValue.dismiss() }
            }
        }
    }

    private func textColor(for type: DiffLine.DiffType) -> Color {
        switch type {
        case .added: return .green
        case .removed: return .red
        case .same: return .secondary
        }
    }

    private func bgColor(for type: DiffLine.DiffType) -> Color {
        switch type {
        case .added: return Color.green.opacity(0.1)
        case .removed: return Color.red.opacity(0.1)
        case .same: return Color.clear
        }
    }
}
