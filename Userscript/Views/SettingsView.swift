import SwiftUI

// MARK: - ⚙️ SettingsView 2.0: Modular Apple-Native Configuration Center (Section 34, 48, 49)
public struct SettingsView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State private var showingExportShare = false
    @State private var exportData: Data? = nil
    @State private var showingCleanupSheet = false
    @State private var showingPrivacySheet = false
    @State private var toastMessage: String? = nil

    public init() {}

    public var body: some View {
        NavigationView {
            ZStack {
                List {
                    // Operational & Safety Section
                    Section("Runtime & Safety") {
                        Toggle("Emergency Killswitch", isOn: Binding(
                            get: { manager.appConfig.emergencyDisableAll },
                            set: { _ in
                                USHaptics.warning()
                                manager.toggleEmergencyDisable()
                            }
                        ))
                        .tint(USColor.error)

                        Toggle("Userscript Safe Mode", isOn: Binding(
                            get: { manager.appConfig.safeMode },
                            set: {
                                manager.appConfig.safeMode = $0
                                manager.saveAppConfig()
                                USHaptics.tap()
                            }
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

                    // Management Centers
                    Section("Management") {
                        NavigationLink(destination: DomainManagementView()) {
                            Label("Domain Rules & Permissions", systemImage: "network")
                        }

                        NavigationLink(destination: ScriptGroupsView()) {
                            Label("Script Groups & Categories", systemImage: "folder.fill")
                        }

                        NavigationLink(destination: MatchTesterView()) {
                            Label("Built-in Match Rule Tester", systemImage: "hammer.fill")
                        }

                        NavigationLink(destination: DebuggerCenterView()) {
                            Label("Debugger & Diagnostics Center", systemImage: "ant.fill")
                        }
                    }

                    // Feature Flags (Section 54)
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

                    // Storage & Maintenance
                    Section("Storage & Maintenance") {
                        Button(action: { showingCleanupSheet = true }) {
                            Label("Cleanup Center & Cache Purge", systemImage: "trash.circle")
                                .foregroundColor(.primary)
                        }

                        Button(action: {
                            exportData = manager.exportScriptsData()
                            showingExportShare = true
                        }) {
                            Label("Export Full Backup (JSON)", systemImage: "square.and.arrow.up")
                                .foregroundColor(.primary)
                        }
                    }

                    // Privacy & Trust (Section 48)
                    Section("Privacy Commitment") {
                        Button(action: { showingPrivacySheet = true }) {
                            HStack {
                                Label("Zero-Telemetry Privacy", systemImage: "hand.raised.fill")
                                    .foregroundColor(.green)
                                Spacer()
                                Text("Offline-First")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }

                    // About Section
                    Section("About") {
                        HStack {
                            Text("Application")
                            Spacer()
                            Text("Userscript for Safari")
                                .foregroundColor(.secondary)
                        }
                        HStack {
                            Text("Version")
                            Spacer()
                            Text("1.0.4 (Build 2026.10)")
                                .foregroundColor(.secondary)
                        }
                        HStack {
                            Text("Architecture")
                            Spacer()
                            Text("Apple-Native Swift + WebExtension 2.0")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .listStyle(.insetGrouped)

                if let toast = toastMessage {
                    VStack {
                        Spacer()
                        USToast(toast)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                            .padding(.bottom, USSpacing.xl)
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

// MARK: - 🛡️ PrivacyCenterView: Zero-Telemetry Commitment (Section 48)
public struct PrivacyCenterView: View {
    @Environment(\.dismiss) private var dismiss

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: USSpacing.l) {
                USCard(padding: USSpacing.l) {
                    HStack(spacing: USSpacing.m) {
                        Image(systemName: "checkmark.shield.fill")
                            .font(.system(size: 40))
                            .foregroundColor(USColor.success)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Zero Telemetry Commitment")
                                .font(.title3.bold())
                            Text("Userscript is strictly offline-first. Your browsing data and scripts never leave your device.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                USSectionHeader("Audit Report")

                USCard {
                    privacyItem(title: "Analytics & Tracking", status: "Disabled (0 requests)", isSecure: true)
                    Divider()
                    privacyItem(title: "External Crash Reports", status: "Disabled", isSecure: true)
                    Divider()
                    privacyItem(title: "Script Storage Location", status: "Local App Group (On-Device)", isSecure: true)
                    Divider()
                    privacyItem(title: "Cross-Site Network Access", status: "Restricted to @grant GM_xmlhttpRequest", isSecure: true)
                }

                USSectionHeader("Permissions Summary")
                USCard {
                    Text("The Safari Web Extension only runs scripts matching your explicitly configured rules. All execution takes place within Safari's content script sandbox.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle("Privacy Center")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
    }

    private func privacyItem(title: String, status: String, isSecure: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.bold())
                Text(status)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
            Image(systemName: isSecure ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundColor(isSecure ? USColor.success : USColor.warning)
        }
    }
}
