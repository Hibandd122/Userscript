import SwiftUI

@main
struct UserscriptApp: App {
    @StateObject private var manager = ScriptManager.shared
    @State private var importedScript: UserScript? = nil
    @State private var showingImportSheet = false
    @State private var selectedTab = 0

    var body: some Scene {
        WindowGroup {
            TabView(selection: $selectedTab) {
                DashboardView()
                    .tabItem {
                        Label("Dashboard", systemImage: "square.grid.2x2.fill")
                    }
                    .tag(0)

                ScriptListView()
                    .tabItem {
                        Label("Scripts", systemImage: "scroll.fill")
                    }
                    .tag(1)

                ScriptGroupsView()
                    .tabItem {
                        Label("Groups", systemImage: "folder.fill")
                    }
                    .tag(2)

                DomainManagementView()
                    .tabItem {
                        Label("Domains", systemImage: "network")
                    }
                    .tag(3)

                DebuggerCenterView()
                    .tabItem {
                        Label("Debugger", systemImage: "ant.fill")
                    }
                    .tag(4)

                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
                    .tag(5)
            }
            .onOpenURL { url in
                handleIncomingURL(url)
            }
            .sheet(isPresented: $showingImportSheet) {
                if let script = importedScript {
                    NavigationView {
                        ScriptDetailView(script: script)
                    }
                    .navigationViewStyle(.stack)
                }
            }
        }
    }

    private func handleIncomingURL(_ url: URL) {
        if url.isFileURL {
            do {
                let script = try manager.importScript(from: url)
                self.importedScript = script
                self.showingImportSheet = true
            } catch {
                print("Failed to open file: \(error.localizedDescription)")
            }
        } else if url.scheme == "userscript" {
            // Deep Link System (Phase 34): e.g. userscript://install?url=...
            if url.host == "install", let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
               let targetParam = components.queryItems?.first(where: { $0.name == "url" })?.value,
               let targetURL = URL(string: targetParam) {
                Task {
                    do {
                        let parsed = try await ScriptDownloader.downloadAndParse(from: targetURL)
                        DispatchQueue.main.async {
                            self.importedScript = parsed
                            self.showingImportSheet = true
                        }
                    } catch {
                        print("Deep link install error: \(error)")
                    }
                }
            }
        }
    }
}
