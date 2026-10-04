import SwiftUI

@main
struct UserscriptApp: App {
    @StateObject private var manager = ScriptManager.shared
    @State private var importedScript: UserScript? = nil
    @State private var showingImportSheet = false

    var body: some Scene {
        WindowGroup {
            ScriptListView()
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
        }
    }
}
