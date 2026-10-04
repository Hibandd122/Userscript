import SwiftUI

public struct SettingsView: View {
    @ObservedObject var manager = ScriptManager.shared
    @ObservedObject var logManager = LogManager.shared
    @State private var showingExportShare = false
    @State private var exportData: Data? = nil
    @State private var showingCleanupSheet = false
    @State private var showingDiagnosticsSheet = false
    @State private var showingLogsSheet = false
    @State private var showingPrivacySheet = false

    public init() {}

    public var body: some View {
        NavigationView {
            List {
                // Section: Emergency & Operational Mode
                Section("Operational State") {
                    Toggle("Emergency Killswitch", isOn: Binding(
                        get: { manager.appConfig.emergencyDisableAll },
                        set: { _ in manager.toggleEmergencyDisable() }
                    ))
                    .tint(.red)

                    Toggle("Userscript Safe Mode", isOn: Binding(
                        get: { manager.appConfig.safeMode },
                        set: { manager.appConfig.safeMode = $0; manager.saveAppConfig() }
                    ))

                    if manager.appConfig.safeMode {
                        Picker("Safe Mode Policy", selection: Binding(
                            get: { manager.appConfig.safeModeOption },
                            set: { manager.appConfig.safeModeOption = $0; manager.saveAppConfig() }
                        )) {
                            ForEach(AppConfig.SafeModeOption.allCases, id: \.self) { opt in
                                Text(opt.rawValue).tag(opt)
                            }
                        }
                    }

                    Picker("Performance Profile", selection: Binding(
                        get: { manager.appConfig.performanceMode },
                        set: { manager.appConfig.performanceMode = $0; manager.saveAppConfig() }
                    )) {
                        ForEach(AppConfig.PerformanceMode.allCases, id: \.self) { p in
                            Text(p.rawValue).tag(p)
                        }
                    }
                }

                // Section: Feature Flags (Phase 54)
                Section("Experimental Feature Flags") {
                    Toggle("SPA Navigation Detection", isOn: Binding(
                        get: { manager.appConfig.featureFlags.spaNavigation },
                        set: { manager.appConfig.featureFlags.spaNavigation = $0; manager.saveAppConfig() }
                    ))
                    Toggle("Automatic Script Recovery", isOn: Binding(
                        get: { manager.appConfig.featureFlags.scriptRecovery },
                        set: { manager.appConfig.featureFlags.scriptRecovery = $0; manager.saveAppConfig() }
                    ))
                    Toggle("Dependency Graph Visualization", isOn: Binding(
                        get: { manager.appConfig.featureFlags.dependencyGraph },
                        set: { manager.appConfig.featureFlags.dependencyGraph = $0; manager.saveAppConfig() }
                    ))
                    Toggle("Advanced Runtime Debugger", isOn: Binding(
                        get: { manager.appConfig.featureFlags.advancedDebugger },
                        set: { manager.appConfig.featureFlags.advancedDebugger = $0; manager.saveAppConfig() }
                    ))
                }

                // Section: Tools & Maintenance
                Section("Storage & Maintenance") {
                    Button(action: { showingCleanupSheet = true }) {
                        Label("Cleanup Center & Cache Purge", systemImage: "trash.circle")
                    }

                    Button(action: {
                        exportData = manager.exportScriptsData()
                        showingExportShare = true
                    }) {
                        Label("Export Full Backup (JSON)", systemImage: "square.and.arrow.up")
                    }
                }

                // Section: Privacy & Security (Phase 48)
                Section("Privacy & Transparency") {
                    Button(action: { showingPrivacySheet = true }) {
                        HStack {
                            Label("Privacy Center", systemImage: "hand.raised.fill")
                                .foregroundColor(.green)
                            Spacer()
                            Text("Zero Telemetry")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                // Section: Safari Setup Guide
                Section("Safari Extension Guide") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("1. Open iOS Settings → Safari → Extensions")
                        Text("2. Enable 'Userscript'")
                        Text("3. Grant 'All Websites' permission")
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }

                // Section: About
                Section("About Userscript") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.3 (Engine v2.0)")
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Text("Schema Version")
                        Spacer()
                        Text("v\(StorageManager.currentSchemaVersion)")
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Settings")
            .sheet(isPresented: $showingCleanupSheet) {
                NavigationView {
                    CleanupCenterView()
                }
            }
            .sheet(isPresented: $showingPrivacySheet) {
                NavigationView {
                    PrivacyCenterView()
                }
            }
            .sheet(isPresented: $showingExportShare) {
                if let data = exportData {
                    ShareSheet(activityItems: [data])
                }
            }
        }
        .navigationViewStyle(.stack)
    }
}

public struct PrivacyCenterView: View {
    @Environment(\.presentationMode) var presentationMode

    public var body: some View {
        List {
            Section(header: Text("Privacy Commitment")) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Image(systemName: "checkmark.shield.fill")
                            .font(.largeTitle)
                            .foregroundColor(.green)
                        VStack(alignment: .leading) {
                            Text("100% Offline & Private")
                                .font(.headline)
                            Text("Zero cloud tracking, zero analytics.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 6)
                }
            }

            Section(header: Text("Telemetry Status")) {
                HStack {
                    Text("Analytics SDK")
                    Spacer()
                    Text("None").foregroundColor(.green).fontWeight(.bold)
                }
                HStack {
                    Text("Crash Reporting")
                    Spacer()
                    Text("Local Only").foregroundColor(.green).fontWeight(.bold)
                }
                HStack {
                    Text("Ad Tracking")
                    Spacer()
                    Text("Blocked").foregroundColor(.green).fontWeight(.bold)
                }
                HStack {
                    Text("External Sync Servers")
                    Spacer()
                    Text("Disabled").foregroundColor(.green).fontWeight(.bold)
                }
            }
        }
        .navigationTitle("Privacy Center")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") { presentationMode.wrappedValue.dismiss() }
            }
        }
    }
}
