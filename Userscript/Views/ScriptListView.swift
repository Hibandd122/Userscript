import SwiftUI

// MARK: - 📜 ScriptListView 2.0: Professional Script Library (Section 6, 7, 8, 24, 53)
public struct ScriptListView: View {
    @ObservedObject var manager = ScriptManager.shared
    @ObservedObject var updater = ScriptUpdater.shared
    @State private var searchText = ""
    @State private var filterMode: FilterMode = .all
    @State private var isCompactMode = false
    @State private var showingAddSheet = false
    @State private var showingNewEditorSheet = false
    @State private var toastMessage: String? = nil

    public enum FilterMode: String, CaseIterable, Identifiable {
        case all = "All"
        case active = "Active"
        case disabled = "Disabled"
        case favorites = "Favorites"
        case errors = "Errors"

        public var id: String { rawValue }
    }

    private var filteredScripts: [UserScript] {
        var list = manager.scripts

        switch filterMode {
        case .all:
            break
        case .active:
            list = list.filter { $0.enabled }
        case .disabled:
            list = list.filter { !$0.enabled }
        case .favorites:
            list = list.filter { $0.favorite }
        case .errors:
            list = list.filter { $0.lastError != nil || $0.statistics.failureCount > 0 }
        }

        let query = searchText.trimmingCharacters(in: .whitespaces)
        if !query.isEmpty {
            list = list.filter {
                $0.name.localizedCaseInsensitiveContains(query) ||
                $0.description.localizedCaseInsensitiveContains(query) ||
                ($0.author?.localizedCaseInsensitiveContains(query) ?? false) ||
                $0.matches.contains(where: { $0.localizedCaseInsensitiveContains(query) })
            }
        }

        // Pinned/Favorites first, then priority, then alphabetical
        return list.sorted {
            if $0.favorite != $1.favorite {
                return $0.favorite && !$1.favorite
            }
            if $0.priority != $1.priority {
                return $0.priority > $1.priority
            }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    public init() {}

    public var body: some View {
        NavigationView {
            ZStack {
                USColor.surfaceBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Filter Chips Bar (Section 8)
                    filterChipsBar
                        .padding(.vertical, USSpacing.s)

                    if manager.scripts.isEmpty {
                        USEmptyState(
                            icon: "scroll.fill",
                            title: "No Userscripts Installed",
                            message: "Customize Safari by installing scripts from URL or creating custom scripts.",
                            actionTitle: "Install Script"
                        ) {
                            showingAddSheet = true
                        }
                    } else if filteredScripts.isEmpty {
                        USEmptyState(
                            icon: "magnifyingglass",
                            title: "No Results Found",
                            message: "No scripts matched your query '\(searchText)'."
                        )
                    } else {
                        // Professional Library List (Section 6)
                        scriptsList
                    }
                }

                if let toast = toastMessage {
                    VStack {
                        Spacer()
                        USToast(toast)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                            .padding(.bottom, USSpacing.xl)
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search scripts, domains, authors...")
            .navigationTitle("Scripts")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {
                        isCompactMode.toggle()
                        USHaptics.tap()
                    }) {
                        Image(systemName: isCompactMode ? "rectangle.grid.1x2" : "list.bullet")
                            .font(.subheadline)
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
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
                                showToast("Checked for script updates")
                            }
                        } label: {
                            Label("Check Updates", systemImage: "arrow.triangle.2.circlepath")
                        }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(USColor.safariBlue)
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                InstallScriptView()
            }
            .sheet(isPresented: $showingNewEditorSheet) {
                ScriptEditorView(script: createDefaultScript())
            }
        }
        .navigationViewStyle(.stack)
    }

    // MARK: - Filter Chips Bar (Section 8)
    private var filterChipsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: USSpacing.s) {
                ForEach(FilterMode.allCases) { mode in
                    USChip(
                        mode.rawValue,
                        isSelected: filterMode == mode,
                        count: countForMode(mode)
                    ) {
                        filterMode = mode
                    }
                }
            }
            .padding(.horizontal, USSpacing.l)
        }
    }

    private func countForMode(_ mode: FilterMode) -> Int {
        switch mode {
        case .all: return manager.scripts.count
        case .active: return manager.activeScriptsCount
        case .disabled: return manager.disabledScriptsCount
        case .favorites: return manager.scripts.filter { $0.favorite }.count
        case .errors: return manager.scriptsWithErrors.count
        }
    }

    // MARK: - Professional Scripts List (Section 6)
    private var scriptsList: some View {
        List {
            ForEach(filteredScripts) { script in
                NavigationLink(destination: ScriptDetailView(script: script)) {
                    scriptLibraryRow(script: script)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        deleteScript(script)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }

                    Button {
                        toggleScript(script)
                    } label: {
                        Label(script.enabled ? "Disable" : "Enable", systemImage: script.enabled ? "pause.circle" : "play.circle")
                    }
                    .tint(script.enabled ? .orange : .green)
                }
                .swipeActions(edge: .leading) {
                    Button {
                        toggleFavorite(script)
                    } label: {
                        Label(script.favorite ? "Unpin" : "Pin", systemImage: script.favorite ? "pin.slash.fill" : "pin.fill")
                    }
                    .tint(.blue)
                }
                .contextMenu {
                    Button {
                        toggleScript(script)
                    } label: {
                        Label(script.enabled ? "Disable" : "Enable", systemImage: script.enabled ? "pause.circle" : "play.circle")
                    }

                    Button {
                        toggleFavorite(script)
                    } label: {
                        Label(script.favorite ? "Unpin Favorite" : "Pin as Favorite", systemImage: script.favorite ? "star.slash" : "star.fill")
                    }

                    Divider()

                    Button(role: .destructive) {
                        deleteScript(script)
                    } label: {
                        Label("Delete Script", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.plain)
        .refreshable {
            await updater.checkAllUpdates(scripts: manager.scripts)
        }
    }

    // MARK: - Single Script Library Row (Section 6)
    private func scriptLibraryRow(script: UserScript) -> some View {
        USCard(padding: isCompactMode ? USSpacing.s : USSpacing.m) {
            HStack(spacing: USSpacing.m) {
                // Status icon toggle
                Button(action: {
                    toggleScript(script)
                }) {
                    Image(systemName: script.enabled ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundColor(script.enabled ? USColor.success : USColor.neutral)
                }
                .buttonStyle(.plain)

                // Info
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        if script.favorite {
                            Image(systemName: "pin.fill")
                                .font(.caption2)
                                .foregroundColor(USColor.safariBlue)
                        }
                        Text(script.name)
                            .font(.subheadline.bold())
                            .foregroundColor(.primary)
                            .lineLimit(1)
                    }

                    if !isCompactMode && !script.description.isEmpty {
                        Text(script.description)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    HStack(spacing: 8) {
                        Text(script.matches.first ?? "All Domains")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                        Text("•")
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                        Text("v\(script.version)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                // Status Pill
                if script.statistics.failureCount > 0 {
                    USBadge("Failed", variant: .error)
                } else if script.enabled {
                    USBadge("ON", variant: .active)
                } else {
                    USBadge("OFF", variant: .disabled)
                }
            }
        }
    }

    private func toggleScript(_ script: UserScript) {
        USHaptics.tap()
        manager.toggle(script: script)
    }

    private func toggleFavorite(_ script: UserScript) {
        USHaptics.tap()
        var updated = script
        updated.favorite.toggle()
        manager.add(script: updated)
        showToast(updated.favorite ? "Pinned to favorites" : "Unpinned")
    }

    private func deleteScript(_ script: UserScript) {
        USHaptics.warning()
        withAnimation(USMotion.quickSpring) {
            manager.delete(script: script)
        }
        showToast("Deleted \(script.name)")
    }

    private func showToast(_ msg: String) {
        withAnimation(USMotion.quickSpring) {
            self.toastMessage = msg
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            withAnimation(USMotion.quickSpring) {
                self.toastMessage = nil
            }
        }
    }

    private func createDefaultScript() -> UserScript {
        UserScript(
            id: UUID(),
            name: "New Custom Script",
            version: "1.0.0",
            description: "Custom Safari enhancement script",
            author: "User",
            matches: ["*://*/*"],
            grants: ["GM_log"],
            runAt: .documentEnd,
            code: """
            // ==UserScript==
            // @name         New Custom Script
            // @namespace    https://userscript.app/
            // @version      1.0.0
            // @description  Custom Safari enhancement script
            // @match        *://*/*
            // @grant        GM_log
            // @run-at       document-end
            // ==/UserScript==

            (function() {
                'use strict';
                console.log('Hello from custom Userscript on Safari!');
            })();
            """
        )
    }
}
