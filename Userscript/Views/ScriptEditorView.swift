import SwiftUI

public struct ScriptEditorView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State var script: UserScript
    @State private var codeText: String
    @State private var hasChanges = false
    @Environment(\.dismiss) private var dismiss

    public init(script: UserScript) {
        _script = State(initialValue: script)
        _codeText = State(initialValue: script.content)
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                TextEditor(text: $codeText)
                    .font(.system(.body, design: .monospaced))
                    .autocorrectionDisabled(true)
                    .textInputAutocapitalization(.never)
                    .padding(8)
                    .onChange(of: codeText) { newValue in
                        hasChanges = (newValue != script.content)
                    }
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

    private func saveScript() {
        var updated = ScriptParser.parse(content: codeText, sourceUrl: script.sourceUrl)
        updated.id = script.id
        updated.enabled = script.enabled
        updated.createdAt = script.createdAt
        updated.updatedAt = Date()
        manager.add(script: updated)
    }
}
