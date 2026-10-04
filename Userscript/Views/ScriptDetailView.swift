import SwiftUI

public struct ScriptDetailView: View {
    @ObservedObject var manager = ScriptManager.shared
    @ObservedObject var updater = ScriptUpdater.shared
    @State var script: UserScript
    @State private var showingEditor = false
    @State private var showingRollbackAlert = false
    @State private var selectedHistoryItem: UserScript.ScriptHistoryItem? = nil
    @State private var isCheckingThisUpdate = false
    @State private var updateResult: ScriptUpdater.UpdateResult? = nil
    @State private var selectedTab: DetailTab = .overview
    @Environment(\.dismiss) private var dismiss

    public enum DetailTab: String, CaseIterable, Identifiable {
        case overview = "Overview"
        case permissions = "Permissions"
        case history = "History"
        
        public var id: String { rawValue }
    }

    public init(script: UserScript) {
        _script = State(initialValue: script)
    }

    public var body: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $selectedTab) {
                ForEach(DetailTab.allCases) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 4)

            List {
                switch selectedTab {
                case .overview:
                    overviewSection
                case .permissions:
                    permissionsSection
                case .history:
                    historySection
                }
            }
            .listStyle(.insetGrouped)
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

    // MARK: - Overview Section
    private var overviewSection: some View {
        Group {
            Section("Status & Timing") {
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
                    Text("v\(script.version)")
                        .foregroundColor(.secondary)
                        .font(.system(.body, design: .monospaced))
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
                    Text("Run-At Timing")
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

            Section("Updates") {
                if let newVer = updater.availableUpdates[script.id] {
                    HStack {
                        Label("New version v\(newVer) available", systemImage: "arrow.triangle.2.circlepath.circle.fill")
                            .foregroundColor(.green)
                            .font(.subheadline)
                        Spacer()
                        Button("Update Now") {
                            Task {
                                if let updated = try? await updater.performUpdate(script: script) {
                                    manager.add(script: updated)
                                }
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                    }
                } else {
                    HStack {
                        Text("Update Check")
                        Spacer()
                        if isCheckingThisUpdate {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Button("Check Update") {
                                Task {
                                    isCheckingThisUpdate = true
                                    let res = await updater.checkForUpdate(script: script)
                                    updateResult = res
                                    isCheckingThisUpdate = false
                                }
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }

                    if let res = updateResult {
                        if res.hasUpdate {
                            Text("New version found: v\(res.remoteVersion)")
                                .font(.caption)
                                .foregroundColor(.green)
                        } else {
                            Text("Up to date (v\(res.currentVersion))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }

            Section("Matched Domains (@match)") {
                ForEach(script.matches, id: \.self) { match in
                    HStack {
                        Image(systemName: "globe")
                            .foregroundColor(.accentColor)
                            .font(.caption)
                        Text(match)
                            .font(.system(.subheadline, design: .monospaced))
                    }
                }
            }

            if !script.includes.isEmpty {
                Section("Included URLs (@include)") {
                    ForEach(script.includes, id: \.self) { include in
                        Text(include)
                            .font(.system(.subheadline, design: .monospaced))
                    }
                }
            }

            if !script.excludes.isEmpty {
                Section("Excluded URLs (@exclude)") {
                    ForEach(script.excludes, id: \.self) { exclude in
                        Text(exclude)
                            .font(.system(.subheadline, design: .monospaced))
                    }
                }
            }

            Section {
                Button {
                    showingEditor = true
                } label: {
                    Label("View / Edit Source Code", systemImage: "chevron.left.forwardslash.chevron.right")
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
    }

    // MARK: - Permissions Section
    private var permissionsSection: some View {
        Group {
            let capabilities = PermissionManager.analyze(grants: script.grants)
            let overallRisk = PermissionManager.calculateOverallRisk(capabilities: capabilities)

            Section("Risk Profile") {
                HStack {
                    Text("Overall Safety")
                    Spacer()
                    Text(overallRisk.rawValue)
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            overallRisk == .safe ? Color.green.opacity(0.15) :
                            overallRisk == .low ? Color.blue.opacity(0.15) :
                            overallRisk == .medium ? Color.orange.opacity(0.15) : Color.red.opacity(0.15)
                        )
                        .foregroundColor(
                            overallRisk == .safe ? .green :
                            overallRisk == .low ? .blue :
                            overallRisk == .medium ? .orange : .red
                        )
                        .clipShape(Capsule())
                }
            }

            Section("Granted Capabilities") {
                ForEach(capabilities) { cap in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Image(systemName: cap.iconName)
                                .foregroundColor(.accentColor)
                            Text(cap.rawValue)
                                .font(.headline)
                            Spacer()
                            Text(cap.riskLevel.rawValue)
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .foregroundColor(.secondary)
                        }
                        Text(cap.description)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }

            Section("Raw Directives (@grant)") {
                ForEach(script.grants, id: \.self) { grant in
                    HStack {
                        Image(systemName: "key.fill")
                            .foregroundColor(.orange)
                            .font(.caption)
                        Text(grant)
                            .font(.system(.caption, design: .monospaced))
                    }
                }
            }
        }
    }

    // MARK: - History Section
    private var historySection: some View {
        Group {
            if script.history.isEmpty {
                Section {
                    VStack(spacing: 12) {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.largeTitle)
                            .foregroundColor(.secondary)
                        Text("No Version History Yet")
                            .font(.headline)
                        Text("Past versions are automatically saved when you update or edit this script.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                }
            } else {
                Section("Previous Versions (\(script.history.count))") {
                    ForEach(script.history) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("v\(item.version)")
                                    .font(.headline)
                                    .fontDesign(.monospaced)
                                Spacer()
                                Text(item.timestamp, style: .date)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            if let summary = item.changeSummary {
                                Text(summary)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            Button("Rollback to this version") {
                                selectedHistoryItem = item
                                showingRollbackAlert = true
                            }
                            .buttonStyle(.borderless)
                            .font(.caption)
                            .foregroundColor(.accentColor)
                            .padding(.top, 2)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .alert("Rollback to v\(selectedHistoryItem?.version ?? "")?", isPresented: $showingRollbackAlert) {
                    Button("Cancel", role: .cancel) {}
                    Button("Rollback", role: .destructive) {
                        if let item = selectedHistoryItem {
                            var current = script
                            updater.rollback(script: &current, to: item)
                            manager.add(script: current)
                        }
                    }
                } message: {
                    Text("This will replace the active script code with the selected version. Current code will be preserved in history.")
                }
            }
        }
    }
}
