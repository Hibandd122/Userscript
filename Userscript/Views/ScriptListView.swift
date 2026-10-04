import SwiftUI

public struct ScriptListView: View {
    @ObservedObject var manager = ScriptManager.shared
    @ObservedObject var updater = ScriptUpdater.shared
    @State private var searchText = ""
    @State private var filterMode: FilterMode = .all
    @State private var showingAddSheet = false
    @State private var showingSettingsSheet = false
    @State private var showingNewEditorSheet = false

    public enum FilterMode: String, CaseIterable, Identifiable {
        case all = "All"
        case active = "Active"
        case disabled = "Disabled"
        case favorites = "Favorites"

        public var id: String { rawValue }
    }

    var filteredScripts: [UserScript] {
        var list = manager.scripts

        switch filterMode {
        case .all:
            break
        case .active:
            list = list.filter { $0.enabled }
        case .disabled:
            list = list.filter { !$0.enabled }
        case .favorites:
            list = list.filter { $0.isFavorite }
        }

        let query = searchText.trimmingCharacters(in: .whitespaces)
        if !query.isEmpty {
            list = list.filter {
                $0.name.localizedCaseInsensitiveContains(query) ||
                $0.description.localizedCaseInsensitiveContains(query) ||
                $0.author.localizedCaseInsensitiveContains(query) ||
                $0.matches.contains(where: { $0.localizedCaseInsensitiveContains(query) })
            }
        }

        // Sort by priority first (highest first), then name
        return list.sorted {
            if $0.priority != $1.priority {
                return $0.priority > $1.priority
            }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    public init() {}

    public var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Metric Stats Banner
                if !manager.scripts.isEmpty {
                    metricsBanner
                        .padding(.horizontal)
                        .padding(.top, 4)
                        .padding(.bottom, 6)

                    // Filter Segments
                    Picker("Filter", selection: $filterMode) {
                        ForEach(FilterMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .padding(.bottom, 6)
                }

                Group {
                    if manager.scripts.isEmpty {
                        emptyStateView
                    } else if filteredScripts.isEmpty {
                        noMatchView
                    } else {
                        List {
                            ForEach(filteredScripts) { script in
                                NavigationLink(destination: ScriptDetailView(script: script)) {
                                    ScriptRowView(
                                        script: script,
                                        hasUpdate: updater.availableUpdates[script.id] != nil,
                                        onToggle: {
                                            manager.toggle(script: script)
                                        },
                                        onToggleFavorite: {
                                            var updated = script
                                            updated.isFavorite.toggle()
                                            manager.add(script: updated)
                                        }
                                    )
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        withAnimation {
                                            manager.delete(script: script)
                                        }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                                .swipeActions(edge: .leading) {
                                    Button {
                                        var updated = script
                                        updated.isFavorite.toggle()
                                        manager.add(script: updated)
                                    } label: {
                                        Label(
                                            script.isFavorite ? "Unfavorite" : "Favorite",
                                            systemImage: script.isFavorite ? "star.slash" : "star.fill"
                                        )
                                    }
                                    .tint(.yellow)
                                }
                            }
                            .onDelete(perform: manager.remove)
                        }
                        .listStyle(.insetGrouped)
                        .refreshable {
                            await updater.checkAllUpdates(scripts: manager.scripts)
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search scripts, authors, domains...")
            .navigationTitle("Userscripts")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showingSettingsSheet = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 12) {
                        if updater.isCheckingUpdates {
                            ProgressView()
                                .controlSize(.small)
                        }

                        Menu {
                            Button {
                                showingAddSheet = true
                            } label: {
                                Label("Install from URL", systemImage: "link.badge.plus")
                            }
                            Button {
                                showingNewEditorSheet = true
                            } label: {
                                Label("Create New Script", systemImage: "square.and.pencil")
                            }
                            Divider()
                            Button {
                                Task {
                                    await updater.checkAllUpdates(scripts: manager.scripts)
                                }
                            } label: {
                                Label("Check for Updates", systemImage: "arrow.triangle.2.circlepath")
                            }
                        } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 16, weight: .bold))
                        }
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                InstallScriptView()
            }
            .sheet(isPresented: $showingNewEditorSheet) {
                ScriptEditorView(script: createDefaultNewScript())
            }
            .sheet(isPresented: $showingSettingsSheet) {
                SettingsView()
            }
        }
        .navigationViewStyle(.stack)
    }

    private var metricsBanner: some View {
        HStack(spacing: 12) {
            MetricCard(
                title: "Installed",
                count: "\(manager.scripts.count)",
                icon: "doc.text.fill",
                color: .blue
            )
            MetricCard(
                title: "Active",
                count: "\(manager.scripts.filter { $0.enabled }.count)",
                icon: "checkmark.circle.fill",
                color: .green
            )
            MetricCard(
                title: "Updates",
                count: "\(updater.availableUpdates.count)",
                icon: "arrow.triangle.2.circlepath",
                color: updater.availableUpdates.isEmpty ? .secondary : .orange
            )
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 64))
                .foregroundColor(.secondary)

            Text("No Userscripts Installed")
                .font(.system(.title2, design: .default).weight(.bold))

            Text("Install scripts from GreasyFork or create your own custom scripts to run in Safari.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            HStack(spacing: 16) {
                Button {
                    showingAddSheet = true
                } label: {
                    Label("Install from URL", systemImage: "link")
                        .font(.system(.body, design: .default).weight(.semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent)

                Button {
                    showingNewEditorSheet = true
                } label: {
                    Label("Create Script", systemImage: "plus")
                        .font(.system(.body, design: .default).weight(.semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
            }
            .padding(.top, 10)
        }
        .padding()
    }

    private var noMatchView: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 40))
                .foregroundColor(.secondary)
            Text("No Matching Scripts")
                .font(.headline)
            Text("No scripts match your filter and search criteria.")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private func createDefaultNewScript() -> UserScript {
        let template = """
        // ==UserScript==
        // @name         New Custom Script
        // @version      1.0.0
        // @description  Custom userscript for Safari
        // @author       Me
        // @match        *://*/*
        // @run-at       document-end
        // @grant        none
        // ==/UserScript==

        (function() {
            'use strict';
            console.log('Userscript loaded on: ' + window.location.href);
        })();
        """
        return ScriptParser.parse(content: template)
    }
}

struct MetricCard: View {
    let title: String
    let count: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundColor(color)
            VStack(alignment: .leading, spacing: 2) {
                Text(count)
                    .font(.system(.headline, design: .default).weight(.bold))
                Text(title)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

struct ScriptRowView: View {
    let script: UserScript
    let hasUpdate: Bool
    let onToggle: () -> Void
    let onToggleFavorite: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Toggle("", isOn: Binding(
                get: { script.enabled },
                set: { _ in onToggle() }
            ))
            .labelsHidden()
            .toggleStyle(SwitchToggleStyle(tint: .accentColor))

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    if script.isFavorite {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundColor(.yellow)
                    }

                    Text(script.name)
                        .font(.headline)
                        .foregroundColor(script.enabled ? .primary : .secondary)
                        .lineLimit(1)

                    Text("v\(script.version)")
                        .font(.system(.caption2, design: .default).weight(.medium))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.15))
                        .clipShape(Capsule())

                    if hasUpdate {
                        Text("UPDATE")
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.2))
                            .foregroundColor(.orange)
                            .clipShape(Capsule())
                    }
                }

                if !script.description.isEmpty {
                    Text(script.description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    if let firstMatch = script.matches.first {
                        Label(firstMatch, systemImage: "globe")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    if script.matches.count > 1 {
                        Text("+\(script.matches.count - 1)")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    let capabilities = PermissionManager.analyze(grants: script.grants)
                    let risk = PermissionManager.calculateOverallRisk(capabilities: capabilities)
                    if risk != .safe {
                        Text(risk.rawValue)
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(risk == .high ? .red : .orange)
                    }
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }
}
