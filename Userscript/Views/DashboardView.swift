import SwiftUI

public struct DashboardView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State private var showingCommandPalette = false
    @State private var showingMatchTester = false
    @State private var selectedScriptForDetail: UserScript? = nil

    public init() {}

    public var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Emergency Killswitch Banner (Phase 50)
                    if manager.appConfig.emergencyDisableAll {
                        emergencyBanner
                    }

                    // Metrics Grid (Phase 1)
                    metricsGrid

                    // Section: Needs Attention (Phase 1)
                    if !manager.needsAttentionScripts.isEmpty {
                        needsAttentionSection
                    }

                    // Section: Favorites
                    if !manager.scripts.filter({ $0.favorite }).isEmpty {
                        favoritesSection
                    }

                    // Section: Recently Used (Phase 1)
                    if !manager.recentlyUsedScripts.isEmpty {
                        recentlyUsedSection
                    }

                    // Section: Quick Tools
                    quickToolsSection
                }
                .padding()
            }
            .navigationTitle("Dashboard")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { showingCommandPalette = true }) {
                        Label("Command Palette", systemImage: "command")
                            .font(.system(size: 14, weight: .semibold))
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { manager.toggleEmergencyDisable() }) {
                        Text(manager.appConfig.emergencyDisableAll ? "EMERGENCY: ON" : "Killswitch")
                            .font(.caption)
                            .fontWeight(.bold)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(manager.appConfig.emergencyDisableAll ? Color.red : Color.gray.opacity(0.2))
                            .foregroundColor(manager.appConfig.emergencyDisableAll ? .white : .primary)
                            .cornerRadius(6)
                    }
                }
            }
            .sheet(isPresented: $showingCommandPalette) {
                CommandPaletteView()
            }
            .sheet(isPresented: $showingMatchTester) {
                NavigationView {
                    MatchTesterView()
                }
            }
            .sheet(item: $selectedScriptForDetail) { script in
                NavigationView {
                    ScriptDetailView(script: script)
                }
            }
        }
        .navigationViewStyle(.stack)
    }

    private var emergencyBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.octagon.fill")
                .font(.title2)
                .foregroundColor(.white)
            VStack(alignment: .leading, spacing: 2) {
                Text("EMERGENCY KILLSWITCH ACTIVE")
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                Text("All userscripts are globally suspended from execution.")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.9))
            }
            Spacer()
            Button("Resume") {
                manager.toggleEmergencyDisable()
            }
            .font(.caption.bold())
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.white)
            .foregroundColor(.red)
            .cornerRadius(8)
        }
        .padding()
        .background(Color.red)
        .cornerRadius(12)
    }

    private var metricsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            DashboardMetricCard(title: "Total", count: "\(manager.scripts.count)", icon: "scroll.fill", color: .blue)
            DashboardMetricCard(title: "Active", count: "\(manager.activeScriptsCount)", icon: "checkmark.circle.fill", color: .green)
            DashboardMetricCard(title: "Disabled", count: "\(manager.disabledScriptsCount)", icon: "pause.circle.fill", color: .orange)
            DashboardMetricCard(title: "Errors", count: "\(manager.scriptsWithErrors.count)", icon: "exclamationmark.triangle.fill", color: .red)
            DashboardMetricCard(title: "Groups", count: "\(manager.groups.count)", icon: "folder.fill", color: .purple)
            DashboardMetricCard(title: "Domain Rules", count: "\(manager.domainRules.count)", icon: "network", color: .teal)
        }
    }

    private var needsAttentionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
                Text("Needs Attention")
                    .font(.headline)
                Spacer()
                Text("\(manager.needsAttentionScripts.count)")
                    .font(.caption)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.orange.opacity(0.2))
                    .cornerRadius(4)
            }

            ForEach(manager.needsAttentionScripts) { script in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(script.name)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        if let err = script.lastError {
                            Text(err)
                                .font(.caption2)
                                .foregroundColor(.red)
                                .lineLimit(1)
                        } else {
                            Text("Repeated execution failures or untrusted source")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                    Spacer()
                    Button("Inspect") {
                        selectedScriptForDetail = script
                    }
                    .font(.caption)
                    .buttonStyle(.bordered)
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(10)
            }
        }
    }

    private var favoritesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "star.fill")
                    .foregroundColor(.yellow)
                Text("Favorites")
                    .font(.headline)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(manager.scripts.filter { $0.favorite }) { script in
                        Button(action: { selectedScriptForDetail = script }) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(script.name)
                                    .font(.subheadline)
                                    .fontWeight(.bold)
                                    .foregroundColor(.primary)
                                    .lineLimit(1)
                                Text("v\(script.version)")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                Spacer()
                                HStack {
                                    Circle()
                                        .fill(script.enabled ? Color.green : Color.gray)
                                        .frame(width: 8, height: 8)
                                    Text(script.enabled ? "Active" : "Off")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .padding()
                            .frame(width: 140, height: 90)
                            .background(Color(.secondarySystemBackground))
                            .cornerRadius(10)
                        }
                    }
                }
            }
        }
    }

    private var recentlyUsedSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "clock.arrow.circlepath")
                    .foregroundColor(.blue)
                Text("Recently Used")
                    .font(.headline)
            }

            ForEach(manager.recentlyUsedScripts.prefix(3)) { script in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(script.name)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        if let last = script.lastExecutedAt {
                            Text("Last run: \(last.formatted(date: .abbreviated, time: .shortened))")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                    Spacer()
                    Text("\(script.executionCount) runs")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(10)
            }
        }
    }

    private var quickToolsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Quick Diagnostics & Tools")
                .font(.headline)

            HStack(spacing: 12) {
                Button(action: { showingMatchTester = true }) {
                    Label("Match Tester", systemImage: "sparkle.magnifyingglass")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue.opacity(0.1))
                        .foregroundColor(.blue)
                        .cornerRadius(10)
                }

                Button(action: { showingCommandPalette = true }) {
                    Label("Palette", systemImage: "command")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.purple.opacity(0.1))
                        .foregroundColor(.purple)
                        .cornerRadius(10)
                }
            }
        }
    }
}

public struct DashboardMetricCard: View {
    public let title: String
    public let count: String
    public let icon: String
    public let color: Color

    public var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(color)
            Text(count)
                .font(.title2.bold())
            Text(title)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(10)
    }
}

