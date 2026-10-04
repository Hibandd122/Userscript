import SwiftUI

public struct SettingsView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State private var showingExportShare = false
    @State private var exportData: Data? = nil
    @State private var showingClearAlert = false
    @Environment(\.dismiss) private var dismiss

    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                Section("Safari Extension Setup") {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 12) {
                            Image(systemName: "safari.fill")
                                .font(.title2)
                                .foregroundColor(.accentColor)
                            Text("How to Enable Extension")
                                .font(.headline)
                        }

                        Text("1. Open iOS **Settings** app\n2. Scroll down and tap **Safari**\n3. Tap **Extensions**\n4. Enable **Userscript**\n5. Set permissions to **Allow on All Websites**")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 6)
                }

                Section("Storage Architecture") {
                    HStack {
                        Text("Active Storage")
                        Spacer()
                        if FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ScriptManager.appGroupIdentifier) != nil {
                            Label("App Group (Shared)", systemImage: "checkmark.circle.fill")
                                .foregroundColor(.green)
                                .font(.caption)
                        } else {
                            Label("App Sandbox (Fallback)", systemImage: "shield.fill")
                                .foregroundColor(.blue)
                                .font(.caption)
                        }
                    }

                    HStack {
                        Text("Total Scripts")
                        Spacer()
                        Text("\(manager.scripts.count)")
                            .foregroundColor(.secondary)
                    }
                }

                Section("Backup & Restore") {
                    Button {
                        if let data = manager.exportScriptsData() {
                            exportData = data
                            showingExportShare = true
                        }
                    } label: {
                        Label("Export Scripts as JSON", systemImage: "square.and.arrow.up")
                    }

                    Button(role: .destructive) {
                        showingClearAlert = true
                    } label: {
                        Label("Remove All Scripts", systemImage: "trash")
                    }
                }

                Section("About Userscript") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0 (Pure Engine)")
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Text("Architecture")
                        Spacer()
                        Text("SwiftUI + Safari Web Ext")
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Text("Telemetry / Ads")
                        Spacer()
                        Text("None (100% Privacy)")
                            .foregroundColor(.green)
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .alert("Remove All Scripts?", isPresented: $showingClearAlert) {
                Button("Cancel", role: .cancel) {}
                Button("Delete All", role: .destructive) {
                    manager.scripts.removeAll()
                    manager.saveScripts()
                }
            } message: {
                Text("This will permanently delete all installed userscripts.")
            }
        }
    }
}
