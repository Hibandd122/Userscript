import SwiftUI

// MARK: - 🧭 UserscriptApp 2.0: Unified Apple-Native Navigation (Section 4, 30, 47, 58)
@main
struct UserscriptApp: App {
    @StateObject private var manager = ScriptManager.shared
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var showingOnboarding = false
    @State private var importedScript: UserScript? = nil
    @State private var showingImportSheet = false
    @State private var selectedTab = 0

    var body: some Scene {
        WindowGroup {
            TabView(selection: $selectedTab) {
                // Tab 1: Home Dashboard (Section 5)
                DashboardView()
                    .tabItem {
                        Label("Home", systemImage: "house.fill")
                    }
                    .tag(0)

                // Tab 2: Script Library (Section 6)
                ScriptListView()
                    .tabItem {
                        Label("Scripts", systemImage: "scroll.fill")
                    }
                    .tag(1)

                // Tab 3: Updates Inbox (Section 16)
                UpdateCenterView()
                    .tabItem {
                        Label("Updates", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .tag(2)

                // Tab 4: Diagnostics & Debugger (Section 18, 19)
                DebuggerCenterView()
                    .tabItem {
                        Label("Diagnostics", systemImage: "cross.case.fill")
                    }
                    .tag(3)

                // Tab 5: Settings (Section 34)
                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
                    .tag(4)
            }
            .onAppear {
                if !hasCompletedOnboarding {
                    showingOnboarding = true
                    hasCompletedOnboarding = true
                }
            }
            .sheet(isPresented: $showingOnboarding) {
                OnboardingView()
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
            // Deep Link System: userscript://install?url=...
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
