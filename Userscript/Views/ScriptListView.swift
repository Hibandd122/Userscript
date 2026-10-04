import SwiftUI

public struct ScriptListView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State private var searchText = ""
    @State private var showingAddSheet = false
    @State private var showingSettingsSheet = false
    @State private var showingNewEditorSheet = false

    var filteredScripts: [UserScript] {
        if searchText.trimmingCharacters(in: .whitespaces).isEmpty {
            return manager.scripts
        }
        return manager.scripts.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.description.localizedCaseInsensitiveContains(searchText) ||
            $0.author.localizedCaseInsensitiveContains(searchText) ||
            $0.matches.contains(where: { $0.localizedCaseInsensitiveContains(searchText) })
        }
    }

    public init() {}

    public var body: some View {
        NavigationStack {
            Group {
                if manager.scripts.isEmpty {
                    emptyStateView
                } else {
                    List {
                        ForEach(filteredScripts) { script in
                            NavigationLink(destination: ScriptDetailView(script: script)) {
                                ScriptRowView(script: script) {
                                    manager.toggle(script: script)
                                }
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
                        }
                        .onDelete(perform: manager.remove)
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .searchable(text: $searchText, prompt: "Search scripts, domains...")
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
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 16, weight: .bold))
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
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 64))
                .foregroundColor(.secondary)

            Text("No Userscripts Installed")
                .font(.title2)
                .fontWeight(.bold)

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
                        .fontWeight(.semibold)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent)

                Button {
                    showingNewEditorSheet = true
                } label: {
                    Label("Create Script", systemImage: "plus")
                        .fontWeight(.semibold)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.bordered)
            }
            .padding(.top, 10)
        }
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

struct ScriptRowView: View {
    let script: UserScript
    let onToggle: () -> Void

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
                    Text(script.name)
                        .font(.headline)
                        .foregroundColor(script.enabled ? .primary : .secondary)
                        .lineLimit(1)

                    Text("v\(script.version)")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.15))
                        .clipShape(Capsule())
                }

                if !script.description.isEmpty {
                    Text(script.description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                HStack(spacing: 6) {
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
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }
}
