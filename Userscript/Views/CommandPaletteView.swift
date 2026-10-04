import SwiftUI

public struct CommandPaletteView: View {
    @Environment(\.presentationMode) var presentationMode
    @ObservedObject var manager = ScriptManager.shared
    @State private var searchText = ""
    @State private var showingExportShare = false
    @State private var exportData: Data? = nil

    public init() {}

    struct CommandItem: Identifiable {
        let id = UUID()
        let title: String
        let subtitle: String
        let icon: String
        let color: Color
        let action: () -> Void
    }

    private var builtInCommands: [CommandItem] {
        [
            CommandItem(
                title: manager.appConfig.emergencyDisableAll ? "Resume All Execution" : "Emergency Killswitch",
                subtitle: "Globally toggle all userscript execution",
                icon: "exclamationmark.octagon.fill",
                color: .red,
                action: { manager.toggleEmergencyDisable() }
            ),
            CommandItem(
                title: "Run Diagnostics",
                subtitle: "Verify storage, permissions, and extension health",
                icon: "cross.case.fill",
                color: .green,
                action: { _ = DiagnosticService.generateReport(scripts: manager.scripts) }
            ),
            CommandItem(
                title: "Export Full Backup",
                subtitle: "Export all scripts and configurations as JSON",
                icon: "square.and.arrow.up.fill",
                color: .blue,
                action: {
                    exportData = manager.exportScriptsData()
                    showingExportShare = true
                }
            ),
            CommandItem(
                title: "Clean Safe Storage",
                subtitle: "Purge old backups and temporary files",
                icon: "trash.fill",
                color: .orange,
                action: { _ = StorageManager.shared.cleanAllSafeItems() }
            )
        ]
    }

    private var filteredCommands: [CommandItem] {
        if searchText.isEmpty { return builtInCommands }
        return builtInCommands.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.subtitle.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var filteredScripts: [UserScript] {
        if searchText.isEmpty { return [] }
        return manager.scripts.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.description.localizedCaseInsensitiveContains(searchText) ||
            $0.matches.joined().localizedCaseInsensitiveContains(searchText)
        }
    }

    public var body: some View {
        NavigationView {
            List {
                Section(header: Text("Quick Actions")) {
                    ForEach(filteredCommands) { cmd in
                        Button(action: {
                            cmd.action()
                            presentationMode.wrappedValue.dismiss()
                        }) {
                            HStack(spacing: 12) {
                                Image(systemName: cmd.icon)
                                    .foregroundColor(cmd.color)
                                    .font(.title3)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(cmd.title)
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.primary)
                                    Text(cmd.subtitle)
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                Image(systemName: "return")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }

                if !filteredScripts.isEmpty {
                    Section(header: Text("Scripts (\(filteredScripts.count))")) {
                        ForEach(filteredScripts) { script in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(script.name)
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                    Text("v\(script.version) • \(script.author)")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                Toggle("", isOn: Binding(
                                    get: { script.enabled },
                                    set: { _ in manager.toggle(script: script) }
                                ))
                                .labelsHidden()
                            }
                        }
                    }
                }
            }
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Type a command or search scripts...")
            .navigationTitle("Command Palette")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
            }
            .sheet(isPresented: $showingExportShare) {
                if let data = exportData {
                    ShareSheet(activityItems: [data])
                }
            }
        }
    }
}
