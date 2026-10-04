import SwiftUI

public struct DebuggerCenterView: View {
    @ObservedObject var logManager = LogManager.shared
    @ObservedObject var scriptManager = ScriptManager.shared
    @State private var selectedTab = 0
    @State private var logFilter: LogManager.LogLevel? = nil

    public init() {}

    public var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                Picker("Debugger Section", selection: $selectedTab) {
                    Text("Timeline").tag(0)
                    Text("Errors").tag(1)
                    Text("Storage").tag(2)
                    Text("Network").tag(3)
                }
                .pickerStyle(.segmented)
                .padding()

                TabView(selection: $selectedTab) {
                    timelineView.tag(0)
                    errorCenterView.tag(1)
                    storageInspectorView.tag(2)
                    networkInspectorInfoView.tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
            .navigationTitle("Debugger & Logs")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { logManager.clear() }) {
                        Image(systemName: "trash")
                    }
                }
            }
        }
        .navigationViewStyle(.stack)
    }

    // Tab 1: Execution Timeline & Console (Phase 19)
    private var timelineView: some View {
        List {
            Section(header: Text("Filter Logs")) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        FilterButton(title: "All", isSelected: logFilter == nil) { logFilter = nil }
                        ForEach(LogManager.LogLevel.allCases, id: \.self) { level in
                            FilterButton(title: level.rawValue, isSelected: logFilter == level) { logFilter = level }
                        }
                    }
                }
            }

            Section(header: Text("Runtime Traces (\(filteredLogs.count))")) {
                if filteredLogs.isEmpty {
                    Text("No logs recorded yet. Events will appear as scripts execute.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } else {
                    ForEach(filteredLogs) { log in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(log.level.rawValue)
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .foregroundColor(color(for: log.level))
                                Text(log.subsystem.rawValue)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                Spacer()
                                Text(log.timestamp.formatted(date: .omitted, time: .standard))
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            Text(log.message)
                                .font(.system(.caption, design: .monospaced))
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    // Tab 2: Global Error Center (Phase 46)
    private var errorCenterView: some View {
        List {
            let errorScripts = scriptManager.scriptsWithErrors
            Section(header: Text("Script Errors (\(errorScripts.count))")) {
                if errorScripts.isEmpty {
                    Text("Zero script errors detected. Everything running cleanly!")
                        .font(.subheadline)
                        .foregroundColor(.green)
                        .padding(.vertical, 8)
                } else {
                    ForEach(errorScripts) { script in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(script.name)
                                    .font(.subheadline)
                                    .fontWeight(.bold)
                                Spacer()
                                Text("Failures: \(script.statistics.failureCount)")
                                    .font(.caption)
                                    .foregroundColor(.red)
                            }
                            if let err = script.lastError {
                                Text(err)
                                    .font(.caption2)
                                    .foregroundColor(.red)
                                    .padding(6)
                                    .background(Color.red.opacity(0.1))
                                    .cornerRadius(6)
                            }
                        }
                    }
                }
            }
        }
    }

    // Tab 3: Storage Inspector (Phase 21)
    private var storageInspectorView: some View {
        List {
            Section(header: Text("Storage Overview")) {
                let health = StorageManager.shared.checkHealth()
                HStack {
                    Text("Active Storage")
                    Spacer()
                    Text(health.type.rawValue)
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Total Files")
                    Spacer()
                    Text("\(health.totalFiles)")
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Total DB Size")
                    Spacer()
                    Text("\(health.databaseSizeBytes / 1024) KB")
                        .foregroundColor(.secondary)
                }
            }

            Section(header: Text("Script Storage Entries")) {
                ForEach(scriptManager.scripts) { script in
                    if !script.storageData.isEmpty {
                        DisclosureGroup("\(script.name) (\(script.storageData.count) keys)") {
                            ForEach(Array(script.storageData.keys.sorted()), id: \.self) { k in
                                HStack {
                                    Text(k).font(.caption).fontWeight(.semibold)
                                    Spacer()
                                    Text(script.storageData[k] ?? "").font(.caption).foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Tab 4: Network Inspector Guide & Stats (Phase 20)
    private var networkInspectorInfoView: some View {
        List {
            Section(header: Text("GM_xmlhttpRequest Auditor")) {
                Text("Cross-origin network requests executed by running userscripts are captured in memory (max 100 entries).")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section(header: Text("Active Subsystem")) {
                HStack {
                    Text("Network Proxy Engine")
                    Spacer()
                    Text("Active")
                        .foregroundColor(.green)
                        .fontWeight(.semibold)
                }
                HStack {
                    Text("Privacy Filter")
                    Spacer()
                    Text("Credentials Stripped")
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    private var filteredLogs: [LogManager.LogEntry] {
        if let filter = logFilter {
            return logManager.entries.filter { $0.level == filter }
        }
        return logManager.entries
    }

    private func color(for level: LogManager.LogLevel) -> Color {
        switch level {
        case .info: return .blue
        case .warning: return .orange
        case .error: return .red
        case .debug: return .purple
        }
    }
}

struct FilterButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(isSelected ? .caption.bold() : .caption)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(isSelected ? Color.blue : Color(.secondarySystemBackground))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(6)
        }
    }
}
