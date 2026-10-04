import Foundation
import Combine

public final class ScriptManager: ObservableObject {
    public static let shared = ScriptManager()
    public static let appGroupIdentifier = "group.com.userscript.app"

    @Published public var scripts: [UserScript] = []
    @Published public var isLoading: Bool = false
    @Published public var errorMessage: String? = nil

    private let fileManager = FileManager.default
    private let scriptsFileName = "userscripts.json"

    public var storageDirectory: URL {
        if let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) {
            return groupURL
        }
        return fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    private var storageFileURL: URL {
        storageDirectory.appendingPathComponent(scriptsFileName)
    }

    private init() {
        loadScripts()
        if scripts.isEmpty {
            installDefaultScripts()
        }
    }

    public func loadScripts() {
        isLoading = true
        defer { isLoading = false }

        guard fileManager.fileExists(atPath: storageFileURL.path) else {
            scripts = []
            return
        }

        do {
            let data = try Data(contentsOf: storageFileURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            scripts = try decoder.decode([UserScript].self, from: data)
        } catch {
            print("Failed to load scripts: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    public func saveScripts() {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(scripts)
            try data.write(to: storageFileURL, options: [.atomicWrite])
            
            notifyExtensionReload()
        } catch {
            print("Failed to save scripts: \(error)")
            errorMessage = error.localizedDescription
        }
    }

    public func add(script: UserScript) {
        if let index = scripts.firstIndex(where: { $0.id == script.id }) {
            scripts[index] = script
        } else {
            scripts.insert(script, at: 0)
        }
        saveScripts()
    }

    public func remove(at offsets: IndexSet) {
        scripts.remove(atOffsets: offsets)
        saveScripts()
    }

    public func delete(script: UserScript) {
        scripts.removeAll(where: { $0.id == script.id })
        saveScripts()
    }

    public func toggle(script: UserScript) {
        if let index = scripts.firstIndex(where: { $0.id == script.id }) {
            scripts[index].enabled.toggle()
            scripts[index].updatedAt = Date()
            saveScripts()
        }
    }

    public func exportScriptsData() -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        encoder.dateEncodingStrategy = .iso8601
        return try? encoder.encode(scripts)
    }

    public func importScripts(from data: Data) throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let imported = try decoder.decode([UserScript].self, from: data)
        for s in imported {
            if let existingIndex = scripts.firstIndex(where: { $0.id == s.id || $0.name == s.name }) {
                scripts[existingIndex] = s
            } else {
                scripts.append(s)
            }
        }
        saveScripts()
    }

    private func notifyExtensionReload() {
        #if canImport(CoreFoundation)
        let notificationCenter = CFNotificationCenterGetDarwinNotifyCenter()
        let notificationName = CFNotificationName("com.userscript.reloadScripts" as CFString)
        CFNotificationCenterPostNotification(notificationCenter, notificationName, nil, nil, true)
        #endif
    }

    private func installDefaultScripts() {
        let sampleScriptContent = """
        // ==UserScript==
        // @name         Stay Clean - Auto Dark Mode
        // @version      1.0.0
        // @description  Applies dark background on web pages
        // @author       Userscript
        // @match        *://*/*
        // @run-at       document-end
        // @grant        GM_addStyle
        // ==/UserScript==

        (function() {
            console.log("[Userscript] Clean Auto Dark Mode Loaded");
        })();
        """

        let defaultScript = ScriptParser.parse(content: sampleScriptContent)
        scripts = [defaultScript]
        saveScripts()
    }
}
