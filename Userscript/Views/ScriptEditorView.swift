import SwiftUI

public struct ScriptEditorView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State var script: UserScript
    @State private var codeText: String
    @State private var searchText = ""
    @State private var showingSearch = false
    @State private var hasChanges = false
    @Environment(\.dismiss) private var dismiss

    public init(script: UserScript) {
        _script = State(initialValue: script)
        _codeText = State(initialValue: script.content)
    }

    private var lineCount: Int {
        codeText.components(separatedBy: "\n").count
    }

    private var matchCount: Int {
        guard !searchText.isEmpty else { return 0 }
        return codeText.components(separatedBy: searchText).count - 1
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar if toggled
                if showingSearch {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)
                        TextField("Find in script...", text: $searchText)
                            .font(.system(.subheadline, design: .monospaced))
                            .autocorrectionDisabled(true)
                            .textInputAutocapitalization(.never)
                        
                        if !searchText.isEmpty {
                            Text("\(matchCount) found")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Button {
                                searchText = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(8)
                    .background(Color.secondary.opacity(0.1))
                }

                // Editor area
                TextEditor(text: $codeText)
                    .font(.system(.footnote, design: .monospaced))
                    .autocorrectionDisabled(true)
                    .textInputAutocapitalization(.never)
                    .padding(8)
                    .onChange(of: codeText) { newValue in
                        hasChanges = (newValue != script.content)
                    }

                // Status Bar at bottom
                HStack {
                    Text("\(lineCount) lines")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(codeText.utf8.count) bytes")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    if hasChanges {
                        Text("• Edited")
                            .font(.caption2)
                            .foregroundColor(.orange)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.secondary.opacity(0.08))
            }
            .navigationTitle(script.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 12) {
                        Button {
                            withAnimation {
                                showingSearch.toggle()
                            }
                        } label: {
                            Image(systemName: "magnifyingglass")
                        }

                        Button("Save") {
                            saveScript()
                            dismiss()
                        }
                        .fontWeight(.bold)
                        .disabled(!hasChanges && !script.content.isEmpty)
                    }
                }
            }
        }
    }

    private func saveScript() {
        var updated = ScriptParser.parse(content: codeText, sourceUrl: script.sourceUrl)
        updated.id = script.id
        updated.enabled = script.enabled
        updated.isFavorite = script.isFavorite
        updated.priority = script.priority
        updated.tags = script.tags
        updated.createdAt = script.createdAt
        updated.updatedAt = Date()
        
        // Save current code to history
        let historyItem = UserScript.ScriptHistoryItem(
            version: script.version,
            content: script.content,
            timestamp: Date(),
            changeSummary: "Manual code edit"
        )
        updated.history = script.history
        updated.history.insert(historyItem, at: 0)

        manager.add(script: updated)
    }
}
