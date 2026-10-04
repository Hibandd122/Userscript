import SwiftUI

public struct ScriptDetailView: View {
    @ObservedObject var manager = ScriptManager.shared
    @ObservedObject var updater = ScriptUpdater.shared
    @State var script: UserScript
    @State private var showingEditor = false
    @State private var showingVersionHistory = false
    @State private var selectedTab: DetailTab = .overview
    @Environment(\.dismiss) private var dismiss

    public enum DetailTab: String, CaseIterable, Identifiable {
        case overview = "Overview"
        case config = "Config"
        case permissions = "Permissions"
        case history = "History"
        case stats = "Stats"
        
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
                case .config:
                    configSection
                case .permissions:
                    permissionsSection
                case .history:
                    historySection
                case .stats:
                    statsSection
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
        .sheet(isPresented: $showingVersionHistory) {
            NavigationView {
                VersionHistoryView(script: script)
            }
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
            Section("Status & Trust") {
                Toggle("Enabled", isOn: Binding(
                    get: { script.enabled },
                    set: { newValue in
                        script.enabled = newValue
                        manager.add(script: script)
                    }
                ))

                HStack {
                    Text("Trust Level")
                    Spacer()
                    Text(script.trustLevel.rawValue)
                        .font(.caption)
                        .fontWeight(.bold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(trustColor.opacity(0.15))
                        .foregroundColor(trustColor)
                        .cornerRadius(6)
                }

                HStack {
                    Text("Integrity Hash (SHA-256)")
                    Spacer()
                    Text(String(script.sha256Hash.prefix(12)) + "...")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(.secondary)
                }

                Picker("Group", selection: Binding(
                    get: { script.group ?? "none" },
                    set: { newVal in
                        script.group = newVal == "none" ? nil : newVal
                        manager.add(script: script)
                    }
                )) {
                    Text("None").tag("none")
                    ForEach(manager.groups) { g in
                        Text(g.name).tag(g.id)
                    }
                }

                Picker("SPA Navigation Mode", selection: Binding(
                    get: { script.spaMode },
                    set: { newVal in
                        script.spaMode = newVal
                        manager.add(script: script)
                    }
                )) {
                    ForEach(UserScript.SPANavigationMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
            }

            Section("Timing & Execution") {
                HStack {
                    Text("Run-At")
                    Spacer()
                    Text(script.runAt.title)
                        .foregroundColor(.secondary)
                }

                HStack {
                    Text("Priority")
                    Spacer()
                    Text("\(script.priority)")
                        .foregroundColor(.secondary)
                }

                Toggle("Run in Frames (@noframes)", isOn: Binding(
                    get: { !script.noframes },
                    set: { script.noframes = !$0; manager.add(script: script) }
                ))
            }

            if !script.description.isEmpty {
                Section("Description") {
                    Text(script.description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    // MARK: - Script Configuration Section (Phase 6)
    private var configSection: some View {
        Group {
            if script.configSchema.isEmpty {
                Section {
                    VStack(alignment: .center, spacing: 8) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.title)
                            .foregroundColor(.secondary)
                        Text("No Script Settings Defined")
                            .font(.headline)
                        Text("This script does not declare metadata @config schema fields.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                }
            } else {
                Section("Script Preferences") {
                    ForEach($script.configSchema) { $field in
                        switch field.type {
                        case .toggle:
                            Toggle(field.label, isOn: Binding(
                                get: { field.currentValue == "true" },
                                set: { field.currentValue = $0 ? "true" : "false"; manager.add(script: script) }
                            ))
                        case .number:
                            HStack {
                                Text(field.label)
                                Spacer()
                                TextField("Value", text: Binding(
                                    get: { field.currentValue },
                                    set: { field.currentValue = $0; manager.add(script: script) }
                                ))
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                            }
                        case .text, .url, .color:
                            HStack {
                                Text(field.label)
                                Spacer()
                                TextField("Value", text: Binding(
                                    get: { field.currentValue },
                                    set: { field.currentValue = $0; manager.add(script: script) }
                                ))
                                .multilineTextAlignment(.trailing)
                            }
                        case .select:
                            if let opts = field.options {
                                Picker(field.label, selection: Binding(
                                    get: { field.currentValue },
                                    set: { field.currentValue = $0; manager.add(script: script) }
                                )) {
                                    ForEach(opts, id: \.self) { opt in
                                        Text(opt).tag(opt)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Permissions Section
    private var permissionsSection: some View {
        Group {
            Section("Matched Domains (@match)") {
                ForEach(script.matches, id: \.self) { match in
                    Text(match)
                        .font(.system(.caption, design: .monospaced))
                }
            }

            if !script.excludes.isEmpty {
                Section("Excluded Domains (@exclude)") {
                    ForEach(script.excludes, id: \.self) { exc in
                        Text(exc)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundColor(.red)
                    }
                }
            }

            Section("Granted APIs (@grant)") {
                ForEach(script.grants, id: \.self) { grant in
                    HStack {
                        Image(systemName: "checkmark.shield")
                            .foregroundColor(.blue)
                        Text(grant)
                            .font(.subheadline)
                    }
                }
            }

            if !script.resources.isEmpty {
                Section("Bundled Resources (@resource)") {
                    ForEach(script.resources) { res in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(res.name)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                Text(res.url)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                        }
                    }
                }
            }
        }
    }

    // MARK: - History Section
    private var historySection: some View {
        Section {
            Button(action: { showingVersionHistory = true }) {
                HStack {
                    Image(systemName: "clock.arrow.circlepath")
                        .foregroundColor(.blue)
                    Text("Open Version Timeline & Diff Viewer")
                        .fontWeight(.semibold)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    // MARK: - Stats Section (Phase 36)
    private var statsSection: some View {
        Group {
            Section("Execution Statistics") {
                HStack {
                    Text("Total Runs")
                    Spacer()
                    Text("\(script.executionCount)")
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Failures")
                    Spacer()
                    Text("\(script.statistics.failureCount)")
                        .foregroundColor(script.statistics.failureCount > 0 ? .red : .secondary)
                }
                if let last = script.lastExecutedAt {
                    HStack {
                        Text("Last Execution")
                        Spacer()
                        Text(last.formatted(date: .abbreviated, time: .shortened))
                            .foregroundColor(.secondary)
                    }
                }
                if let err = script.lastError {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Last Error Message:")
                            .font(.caption)
                            .foregroundColor(.red)
                        Text(err)
                            .font(.system(.caption2, design: .monospaced))
                            .padding(6)
                            .background(Color.red.opacity(0.1))
                            .cornerRadius(6)
                    }
                }
            }

            Section {
                Button("Reset Statistics") {
                    script.executionCount = 0
                    script.statistics = UserScript.ScriptStatistics()
                    script.lastError = nil
                    manager.add(script: script)
                }
                .foregroundColor(.red)
            }
        }
    }

    private var trustColor: Color {
        switch script.trustLevel {
        case .trusted: return .green
        case .knownSource: return .blue
        case .local: return .purple
        case .modified: return .orange
        case .unknown: return .red
        }
    }
}
