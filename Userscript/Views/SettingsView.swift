import SwiftUI

public struct SettingsView: View {
    @ObservedObject var manager = ScriptManager.shared
    @ObservedObject var logManager = LogManager.shared
    @State private var showingExportShare = false
    @State private var exportData: Data? = nil
    @State private var showingClearAlert = false
    @State private var diagnosticReport: DiagnosticReport? = nil
    @State private var showingDiagnosticsSheet = false
    @State private var showingLogsSheet = false
    @State private var copiedDiagnostic = false
    @Environment(\.dismiss) private var dismiss

    public init() {}

    public var body: some View {
        NavigationView {
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

                Section("Storage Architecture & Health") {
                    let health = StorageManager.shared.checkHealth()

                    HStack {
                        Text("Active Storage")
                        Spacer()
                        if health.type == .appGroup {
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
                        Text("Writable")
                        Spacer()
                        Text(health.isWritable ? "Yes" : "Read-Only (Error)")
                            .foregroundColor(health.isWritable ? .green : .red)
                            .font(.caption)
                    }

                    HStack {
                        Text("Database Size")
                        Spacer()
                        Text(ByteCountFormatter.string(fromByteCount: health.databaseSizeBytes, countStyle: .file))
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }

                    HStack {
                        Text("Automated Backups")
                        Spacer()
                        Text("\(health.backupCount) available")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                }

                Section("Diagnostics & Troubleshooting") {
                    Button {
                        diagnosticReport = DiagnosticService.generateReport(scripts: manager.scripts)
                        showingDiagnosticsSheet = true
                    } label: {
                        Label("Run System Diagnostics", systemImage: "stethoscope")
                    }

                    Button {
                        showingLogsSheet = true
                    } label: {
                        Label("View Runtime Logs (\(logManager.entries.count))", systemImage: "text.alignleft")
                    }
                }

                Section("Backup & Migration") {
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
                        Text("Extension Protocol")
                        Spacer()
                        Text("Version 1 (Handshake verified)")
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Text("Telemetry / Ads")
                        Spacer()
                        Text("None (100% Privacy-First)")
                            .foregroundColor(.green)
                    }
                    HStack {
                        Text("License")
                        Spacer()
                        Text("Open Source (MIT)")
                            .foregroundColor(.secondary)
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
            .sheet(isPresented: $showingDiagnosticsSheet) {
                if let report = diagnosticReport {
                    NavigationView {
                        ScrollView {
                            Text(report.formattedText)
                                .font(.system(.caption, design: .monospaced))
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .navigationTitle("System Diagnostics")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .navigationBarLeading) {
                                Button("Copy") {
                                    #if canImport(UIKit)
                                    UIPasteboard.general.string = report.formattedText
                                    #endif
                                    copiedDiagnostic = true
                                }
                            }
                            ToolbarItem(placement: .navigationBarTrailing) {
                                Button("Done") {
                                    showingDiagnosticsSheet = false
                                }
                            }
                        }
                    }
                    .navigationViewStyle(.stack)
                }
            }
            .sheet(isPresented: $showingLogsSheet) {
                NavigationView {
                    List {
                        if logManager.entries.isEmpty {
                            Text("No runtime logs recorded yet.")
                                .foregroundColor(.secondary)
                        } else {
                            ForEach(logManager.entries.reversed()) { entry in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text("\(entry.level.emoji) [\(entry.subsystem.rawValue)]")
                                            .font(.caption2.bold())
                                        Spacer()
                                        Text(entry.timestamp, style: .time)
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                    }
                                    Text(entry.message)
                                        .font(.system(.caption, design: .monospaced))
                                    if let details = entry.details {
                                        Text(details)
                                            .font(.system(.caption2, design: .monospaced))
                                            .foregroundColor(.secondary)
                                    }
                                }
                                .padding(.vertical, 2)
                            }
                        }
                    }
                    .navigationTitle("Runtime Logs")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarLeading) {
                            Button("Clear") {
                                logManager.clear()
                            }
                        }
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") {
                                showingLogsSheet = false
                            }
                        }
                    }
                }
                .navigationViewStyle(.stack)
            }
        }
        .navigationViewStyle(.stack)
    }
}
