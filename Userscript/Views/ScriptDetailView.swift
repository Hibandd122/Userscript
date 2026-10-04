import SwiftUI

// MARK: - 🔍 ScriptDetailView 2.0: Apple-Native Script Inspector & Hero Hub (Section 9, 10, 12, 13, 15)
public struct ScriptDetailView: View {
    @ObservedObject var manager = ScriptManager.shared
    @ObservedObject var updater = ScriptUpdater.shared
    @State var script: UserScript
    @State private var showingEditor = false
    @State private var showingVersionHistory = false
    @State private var showingShareSheet = false
    @State private var selectedTab: DetailTab = .overview
    @Environment(\.dismiss) private var dismiss

    public enum DetailTab: String, CaseIterable, Identifiable {
        case overview = "Overview"
        case permissions = "Permissions"
        case config = "Config"
        case dependencies = "Dependencies"
        case stats = "Stats"

        public var id: String { rawValue }
    }

    public init(script: UserScript) {
        _script = State(initialValue: script)
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Segmented Picker Header
            Picker("Section", selection: $selectedTab) {
                ForEach(DetailTab.allCases) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, USSpacing.l)
            .padding(.vertical, USSpacing.s)

            ScrollView {
                VStack(spacing: USSpacing.l) {
                    // Hero Section (Section 10)
                    heroCard

                    switch selectedTab {
                    case .overview:
                        overviewContent
                    case .permissions:
                        permissionsContent
                    case .config:
                        configContent
                    case .dependencies:
                        dependenciesContent
                    case .stats:
                        statsContent
                    }
                }
                .padding(.horizontal, USSpacing.l)
                .padding(.vertical, USSpacing.s)
            }
        }
        .navigationTitle(script.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    USHaptics.tap()
                    showingEditor = true
                }) {
                    Text("Edit")
                        .font(.subheadline.bold())
                        .foregroundColor(USColor.safariBlue)
                }
            }
        }
        .sheet(isPresented: $showingEditor) {
            ScriptEditorView(script: script)
        }
        .sheet(isPresented: $showingVersionHistory) {
            NavigationView {
                VersionHistoryView(script: script)
            }
        }
        .sheet(isPresented: $showingShareSheet) {
            ShareSheet(activityItems: [script.content])
        }
        .onReceive(manager.$scripts) { updatedScripts in
            if let current = updatedScripts.first(where: { $0.id == script.id }) {
                self.script = current
            }
        }
    }

    // MARK: - Hero Header Card (Section 10)
    private var heroCard: some View {
        USCard(padding: USSpacing.l) {
            VStack(alignment: .leading, spacing: USSpacing.m) {
                HStack(spacing: USSpacing.m) {
                    ZStack {
                        RoundedRectangle(cornerRadius: USRadius.medium)
                            .fill(script.enabled ? USColor.safariBlue.opacity(0.15) : Color.secondary.opacity(0.15))
                            .frame(width: 48, height: 48)
                        Image(systemName: "scroll.fill")
                            .font(.title2)
                            .foregroundColor(script.enabled ? USColor.safariBlue : .secondary)
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text(script.name)
                            .font(.title3.bold())
                            .foregroundColor(.primary)
                            .lineLimit(1)
                        HStack(spacing: 6) {
                            USBadge("v\(script.version)", variant: .info)
                            USBadge(script.trustLevel.rawValue, variant: script.trustLevel == .trusted ? .active : .neutral)
                            if script.favorite {
                                USBadge("Pinned", variant: .custom(USColor.purple, "Pinned"), icon: "pin.fill")
                            }
                        }
                    }

                    Spacer()

                    // Toggle switch
                    Toggle("", isOn: Binding(
                        get: { script.enabled },
                        set: { val in
                            USHaptics.tap()
                            script.enabled = val
                            manager.add(script: script)
                        }
                    ))
                    .labelsHidden()
                }

                if !script.description.isEmpty {
                    Text(script.description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Divider()

                // Action Bar
                HStack(spacing: USSpacing.s) {
                    USButton("Editor", icon: "square.and.pencil", style: .secondary) {
                        showingEditor = true
                    }
                    USButton("History", icon: "clock.arrow.circlepath", style: .secondary) {
                        showingVersionHistory = true
                    }
                    USButton("Share", icon: "square.and.arrow.up", style: .secondary) {
                        showingShareSheet = true
                    }
                }
            }
        }
    }

    // MARK: - 1. Overview Content (Section 12, 14)
    private var overviewContent: some View {
        VStack(alignment: .leading, spacing: USSpacing.m) {
            USSectionHeader("Target Domains & Rules", subtitle: "Websites where script is active")
            USCard {
                VStack(alignment: .leading, spacing: USSpacing.s) {
                    if script.matches.isEmpty {
                        Text("All Websites (*://*/*)")
                            .font(.system(size: 13, design: .monospaced))
                    } else {
                        ForEach(script.matches, id: \.self) { match in
                            HStack {
                                Image(systemName: "globe")
                                    .foregroundColor(USColor.safariBlue)
                                Text(match)
                                    .font(.system(size: 13, design: .monospaced))
                                Spacer()
                                USBadge("Match", variant: .active)
                            }
                        }
                    }
                }
            }

            USSectionHeader("Runtime Execution Metadata")
            USCard {
                metadataRow(label: "Run-At Stage", value: script.runAt.rawValue)
                Divider()
                metadataRow(label: "SPA Navigation Mode", value: script.spaMode.rawValue)
                Divider()
                metadataRow(label: "Author", value: script.author ?? "Unknown")
                Divider()
                metadataRow(label: "Namespace", value: script.namespace ?? "userscript.app")
            }
        }
    }

    private func metadataRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline.bold())
                .foregroundColor(.primary)
        }
    }

    // MARK: - 2. Permissions Content (Section 13)
    private var permissionsContent: some View {
        VStack(alignment: .leading, spacing: USSpacing.m) {
            USSectionHeader("Sandbox & Capabilities", subtitle: "APIs requested via @grant headers")

            if script.grants.isEmpty {
                USCard {
                    HStack {
                        Image(systemName: "checkmark.shield.fill")
                            .foregroundColor(USColor.success)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Fully Sandboxed (Safe)")
                                .font(.headline)
                            Text("No elevated GM APIs requested. Runs in pure content script isolation.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            } else {
                ForEach(script.grants, id: \.self) { grant in
                    USCard {
                        HStack(spacing: USSpacing.m) {
                            Image(systemName: iconForGrant(grant))
                                .font(.title3)
                                .foregroundColor(colorForGrant(grant))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(grant)
                                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                                Text(descriptionForGrant(grant))
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            USBadge("Granted", variant: .active)
                        }
                    }
                }
            }
        }
    }

    private func iconForGrant(_ grant: String) -> String {
        if grant.contains("xmlhttpRequest") { return "network" }
        if grant.contains("setValue") || grant.contains("getValue") { return "internaldrive" }
        if grant.contains("clipboard") { return "doc.on.clipboard" }
        if grant.contains("notification") { return "bell.badge" }
        return "gearshape.2.fill"
    }

    private func colorForGrant(_ grant: String) -> Color {
        if grant.contains("xmlhttpRequest") { return USColor.warning }
        if grant.contains("setValue") || grant.contains("getValue") { return USColor.safariBlue }
        return USColor.purple
    }

    private func descriptionForGrant(_ grant: String) -> String {
        if grant.contains("xmlhttpRequest") { return "Allows cross-origin HTTP/HTTPS requests" }
        if grant.contains("setValue") || grant.contains("getValue") { return "Allows persistent key-value storage in App Group" }
        if grant.contains("clipboard") { return "Allows reading and writing to system clipboard" }
        return "Custom script execution capability"
    }

    // MARK: - 3. Config Content (Section 6)
    private var configContent: some View {
        VStack(alignment: .leading, spacing: USSpacing.m) {
            USSectionHeader("User Preferences", subtitle: "Declared via @config metadata")

            if script.configSchema.isEmpty {
                USEmptyState(
                    icon: "slider.horizontal.3",
                    title: "No Config Schema",
                    message: "This script did not declare any @config preferences."
                )
            } else {
                USCard {
                    VStack(spacing: USSpacing.m) {
                        ForEach(script.configSchema, id: \.key) { item in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.label)
                                        .font(.subheadline.bold())
                                    Text(item.currentValue)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                Text(item.type.rawValue)
                                    .font(.caption2.bold())
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.secondary.opacity(0.15))
                                    .cornerRadius(4)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - 4. Dependencies Content (Section 15)
    private var dependenciesContent: some View {
        VStack(alignment: .leading, spacing: USSpacing.m) {
            USSectionHeader("External Dependencies", subtitle: "Loaded via @require and @resource")

            if script.requires.isEmpty {
                USEmptyState(
                    icon: "shippingbox",
                    title: "Zero Dependencies",
                    message: "This script is standalone and does not import third-party libraries."
                )
            } else {
                ForEach(script.requires, id: \.self) { dep in
                    USCard {
                        HStack {
                            Image(systemName: "link")
                                .foregroundColor(USColor.safariBlue)
                            Text(dep)
                                .font(.system(size: 11, design: .monospaced))
                                .lineLimit(1)
                            Spacer()
                            USBadge("Cached", variant: .active)
                        }
                    }
                }
            }
        }
    }

    // MARK: - 5. Stats Content (Section 26)
    private var statsContent: some View {
        VStack(alignment: .leading, spacing: USSpacing.m) {
            USSectionHeader("Runtime Diagnostics", subtitle: "Execution indicators for Safari")

            HStack(spacing: USSpacing.m) {
                USMetric(title: "Executions", value: "\(script.statistics.timesExecuted)", icon: "play.circle.fill", color: USColor.safariBlue)
                USMetric(title: "Failures", value: "\(script.statistics.failureCount)", icon: "exclamationmark.triangle.fill", color: script.statistics.failureCount > 0 ? USColor.error : USColor.neutral)
            }

            if let lastRun = script.statistics.lastRunAt {
                USCard {
                    HStack {
                        Text("Last Execution")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Spacer()
                        Text(lastRun.formatted(date: .abbreviated, time: .standard))
                            .font(.subheadline.bold())
                    }
                }
            }
        }
    }
}
