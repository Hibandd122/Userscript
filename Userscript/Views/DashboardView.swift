import SwiftUI

// MARK: - 🏠 DashboardView 2.0: Apple-Native Command & Intelligence Center (Section 5)
public struct DashboardView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State private var showingCommandPalette = false
    @State private var showingMatchTester = false
    @State private var showingInstallSheet = false
    @State private var selectedScriptForDetail: UserScript? = nil

    public init() {}

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "Good morning" }
        if hour < 18 { return "Good afternoon" }
        return "Good evening"
    }

    public var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: USSpacing.l) {
                    // Header Greeting
                    headerGreetingSection

                    // Emergency Killswitch Alert (Phase 50)
                    if manager.appConfig.emergencyDisableAll {
                        emergencyKillswitchCard
                    }

                    // Hero Stat Card (Section 5)
                    heroStatusCard

                    // Quick Actions (Section 5)
                    quickActionsGrid

                    // Section: Needs Attention (Section 1, 5)
                    if !manager.needsAttentionScripts.isEmpty {
                        needsAttentionSection
                    }

                    // Section: Favorites (Section 24)
                    let favorites = manager.scripts.filter { $0.favorite }
                    if !favorites.isEmpty {
                        favoritesSection(favorites: favorites)
                    }

                    // Section: Recently Used (Section 25)
                    if !manager.recentlyUsedScripts.isEmpty {
                        recentlyUsedSection
                    }
                }
                .padding(.horizontal, USSpacing.l)
                .padding(.vertical, USSpacing.m)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 6) {
                        Image(systemName: "safari.fill")
                            .foregroundColor(USColor.safariBlue)
                            .font(.subheadline)
                        Text("Userscript")
                            .font(.headline)
                    }
                }

                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {
                        USHaptics.tap()
                        showingCommandPalette = true
                    }) {
                        Image(systemName: "command")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.primary)
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        USHaptics.warning()
                        manager.toggleEmergencyDisable()
                    }) {
                        if manager.appConfig.emergencyDisableAll {
                            USBadge("STOPPED", variant: .error, icon: "exclamationmark.octagon.fill")
                        } else {
                            Image(systemName: "shield.lefthalf.filled")
                                .foregroundColor(USColor.safariBlue)
                        }
                    }
                }
            }
            .sheet(isPresented: $showingCommandPalette) {
                CommandPaletteView()
            }
            .sheet(isPresented: $showingInstallSheet) {
                InstallScriptView()
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

    // MARK: - Header Greeting Section
    private var headerGreetingSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(greetingText)
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                    .textCase(.uppercase)
                Text("Control Center")
                    .font(.title2.bold())
            }
            Spacer()
            USBadge("Safari 17+", variant: .info, icon: "checkmark.circle.fill")
        }
    }

    // MARK: - Emergency Killswitch Active Card
    private var emergencyKillswitchCard: some View {
        USCard {
            HStack(spacing: USSpacing.m) {
                Image(systemName: "exclamationmark.octagon.fill")
                    .font(.title2)
                    .foregroundColor(USColor.error)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Emergency Killswitch Active")
                        .font(.headline)
                        .foregroundColor(USColor.error)
                    Text("All userscript execution is suspended across Safari.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Button(action: {
                    USHaptics.tap()
                    manager.toggleEmergencyDisable()
                }) {
                    Text("Resume")
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(USColor.error)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                }
            }
        }
    }

    // MARK: - Hero Status Card (Section 5)
    private var heroStatusCard: some View {
        USCard(padding: USSpacing.l) {
            VStack(alignment: .leading, spacing: USSpacing.m) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Script Overview")
                            .font(.headline)
                        Text("\(manager.scripts.count) scripts configured in local storage")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Image(systemName: "shield.checkerboard")
                        .font(.title2)
                        .foregroundColor(USColor.safariBlue)
                }

                Divider()

                HStack(spacing: USSpacing.m) {
                    heroMetricItem(title: "Active", count: "\(manager.activeScriptsCount)", color: USColor.success)
                    heroMetricItem(title: "Disabled", count: "\(manager.disabledScriptsCount)", color: USColor.neutral)
                    heroMetricItem(title: "Attention", count: "\(manager.needsAttentionScripts.count)", color: manager.needsAttentionScripts.isEmpty ? USColor.neutral : USColor.warning)
                    heroMetricItem(title: "Groups", count: "\(manager.groups.count)", color: USColor.purple)
                }
            }
        }
    }

    private func heroMetricItem(title: String, count: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(count)
                .font(.title3.bold())
                .foregroundColor(color)
            Text(title)
                .font(.system(size: 11))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Quick Actions (Section 5)
    private var quickActionsGrid: some View {
        HStack(spacing: USSpacing.m) {
            quickActionButton(title: "Install", icon: "plus.circle.fill", color: USColor.safariBlue) {
                showingInstallSheet = true
            }
            quickActionButton(title: "Palette", icon: "command", color: .purple) {
                showingCommandPalette = true
            }
            quickActionButton(title: "Tester", icon: "hammer.fill", color: .teal) {
                showingMatchTester = true
            }
            quickActionButton(title: "Diagnostics", icon: "cross.case.fill", color: USColor.success) {
                showingCommandPalette = true
            }
        }
    }

    private func quickActionButton(title: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: {
            USHaptics.tap()
            action()
        }) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(color)
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.primary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(USColor.secondarySurface)
            .cornerRadius(USRadius.medium)
            .overlay(
                RoundedRectangle(cornerRadius: USRadius.medium)
                    .stroke(USColor.separator.opacity(0.4), lineWidth: 0.8)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Needs Attention Section
    private var needsAttentionSection: some View {
        VStack(alignment: .leading, spacing: USSpacing.s) {
            USSectionHeader("Needs Attention", subtitle: "Scripts with recorded runtime failures")

            LazyVStack(spacing: USSpacing.s) {
                ForEach(manager.needsAttentionScripts) { script in
                    Button(action: {
                        selectedScriptForDetail = script
                    }) {
                        USCard(padding: USSpacing.m) {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(script.name)
                                        .font(.subheadline.bold())
                                        .foregroundColor(.primary)
                                    if let err = script.lastError {
                                        Text(err)
                                            .font(.caption2)
                                            .foregroundColor(USColor.error)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer()
                                USBadge("\(script.statistics.failureCount)x Failed", variant: .error, icon: "exclamationmark.triangle.fill")
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Favorites Section
    private func favoritesSection(favorites: [UserScript]) -> some View {
        VStack(alignment: .leading, spacing: USSpacing.s) {
            USSectionHeader("Pinned & Favorites", subtitle: "Quick access to frequently run scripts")

            LazyVStack(spacing: USSpacing.s) {
                ForEach(favorites) { script in
                    scriptItemRow(script: script)
                }
            }
        }
    }

    // MARK: - Recently Used Section
    private var recentlyUsedSection: some View {
        VStack(alignment: .leading, spacing: USSpacing.s) {
            USSectionHeader("Recent Activity", subtitle: "Executed scripts on matched websites")

            LazyVStack(spacing: USSpacing.s) {
                ForEach(manager.recentlyUsedScripts) { script in
                    scriptItemRow(script: script)
                }
            }
        }
    }

    private func scriptItemRow(script: UserScript) -> some View {
        Button(action: {
            selectedScriptForDetail = script
        }) {
            USCard(padding: USSpacing.m) {
                HStack(spacing: USSpacing.m) {
                    Image(systemName: script.enabled ? "checkmark.circle.fill" : "pause.circle.fill")
                        .foregroundColor(script.enabled ? USColor.success : USColor.neutral)
                        .font(.title3)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(script.name)
                            .font(.subheadline.bold())
                            .foregroundColor(.primary)
                        Text(script.matches.first ?? "All Websites")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    USBadge("v\(script.version)", variant: .neutral)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
