import SwiftUI

public struct ScriptDetailView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State var script: UserScript
    @State private var showingEditor = false
    @Environment(\.dismiss) private var dismiss

    public init(script: UserScript) {
        _script = State(initialValue: script)
    }

    public var body: some View {
        List {
            Section("Status & Information") {
                Toggle("Enabled", isOn: Binding(
                    get: { script.enabled },
                    set: { newValue in
                        script.enabled = newValue
                        manager.add(script: script)
                    }
                ))

                HStack {
                    Text("Version")
                    Spacer()
                    Text(script.version)
                        .foregroundColor(.secondary)
                }

                if !script.author.isEmpty {
                    HStack {
                        Text("Author")
                        Spacer()
                        Text(script.author)
                            .foregroundColor(.secondary)
                    }
                }

                HStack {
                    Text("Execution Timing")
                    Spacer()
                    Text(script.runAt.title)
                        .foregroundColor(.secondary)
                }

                if !script.description.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Description")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(script.description)
                            .font(.body)
                    }
                }
            }

            Section("Matched Domains (@match)") {
                ForEach(script.matches, id: \.self) { match in
                    HStack {
                        Image(systemName: "link")
                            .foregroundColor(.accentColor)
                            .font(.caption)
                        Text(match)
                            .font(.system(.body, design: .monospaced))
                    }
                }
            }

            if !script.includes.isEmpty {
                Section("Included URLs (@include)") {
                    ForEach(script.includes, id: \.self) { include in
                        Text(include)
                            .font(.system(.body, design: .monospaced))
                    }
                }
            }

            if !script.excludes.isEmpty {
                Section("Excluded URLs (@exclude)") {
                    ForEach(script.excludes, id: \.self) { exclude in
                        Text(exclude)
                            .font(.system(.body, design: .monospaced))
                    }
                }
            }

            Section("Permissions (@grant)") {
                ForEach(script.grants, id: \.self) { grant in
                    HStack {
                        Image(systemName: "key.fill")
                            .foregroundColor(.orange)
                            .font(.caption)
                        Text(grant)
                            .font(.system(.body, design: .monospaced))
                    }
                }
            }

            Section {
                Button {
                    showingEditor = true
                } label: {
                    Label("Edit Source Code", systemImage: "chevron.left.forwardslash.chevron.right")
                        .foregroundColor(.accentColor)
                }

                Button(role: .destructive) {
                    manager.delete(script: script)
                    dismiss()
                } label: {
                    Label("Delete Script", systemImage: "trash")
                }
            }
        }
        .navigationTitle(script.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Edit") {
                    showingEditor = true
                }
            }
        }
        .sheet(isPresented: $showingEditor) {
            ScriptEditorView(script: script)
        }
        .onReceive(manager.$scripts) { updatedScripts in
            if let current = updatedScripts.first(where: { $0.id == script.id }) {
                self.script = current
            }
        }
    }
}
