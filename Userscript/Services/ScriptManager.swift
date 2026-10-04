import Foundation
import Combine

public final class ScriptManager: ObservableObject {
    public static let shared = ScriptManager()
    public static let appGroupIdentifier = StorageManager.appGroupIdentifier

    @Published public var scripts: [UserScript] = []
    @Published public var isLoading: Bool = false
    @Published public var errorMessage: String? = nil
    @Published public var selectedTagFilter: String? = nil
    @Published public var showFavoritesOnly: Bool = false

    private let storage = StorageManager.shared
    private let logger = LogManager.shared
    private let scriptsFileName = "userscripts.json"
    private let indexFileName = "script_index.json"

    private init() {
        loadScripts()
        if scripts.isEmpty {
            installDefaultScripts()
        }
    }

    public var availableTags: [String] {
        var tagsSet = Set<String>()
        for s in scripts {
            for t in s.tags {
                tagsSet.insert(t)
            }
        }
        return Array(tagsSet).sorted()
    }

    public func loadScripts() {
        isLoading = true
        defer { isLoading = false }

        guard let data = storage.read(filename: scriptsFileName) else {
            scripts = []
            return
        }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            scripts = try decoder.decode([UserScript].self, from: data)
            // Sort by priority descending, then name
            scripts.sort {
                if $0.priority != $1.priority {
                    return $0.priority > $1.priority
                }
                return $0.name.localizedCompare($1.name) == .orderedAscending
            }
            logger.log(.info, subsystem: .storage, message: "Loaded \(scripts.count) scripts from \(storage.activeStorageType.rawValue)")
            generateAndSaveIndex()
        } catch {
            logger.log(.error, subsystem: .storage, message: "Failed to decode scripts: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
    }

    public func saveScripts() {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(scripts)
            try storage.write(data: data, to: scriptsFileName)
            
            generateAndSaveIndex()
            notifyExtensionReload()
            logger.log(.info, subsystem: .storage, message: "Saved \(scripts.count) scripts successfully")
        } catch {
            logger.log(.error, subsystem: .storage, message: "Save failure: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
    }

    /// Generates lightweight index JSON for Safari Web Extension (Phase 19 & 42)
    private func generateAndSaveIndex() {
        let indexPayload = scripts.map { $0.extensionPayload }
        if let data = try? JSONSerialization.data(withJSONObject: indexPayload, options: [.prettyPrinted]) {
            try? storage.write(data: data, to: indexFileName)
        }
    }

    public func add(script: UserScript) {
        if let index = scripts.firstIndex(where: { $0.id == script.id }) {
            scripts[index] = script
        } else {
            scripts.append(script)
        }
        scripts.sort {
            if $0.priority != $1.priority {
                return $0.priority > $1.priority
            }
            return $0.name.localizedCompare($1.name) == .orderedAscending
        }
        saveScripts()
        logger.log(.info, subsystem: .general, message: "Added/Updated script: \(script.name) (v\(script.version))")
    }

    public func remove(at offsets: IndexSet) {
        let toRemove = offsets.map { scripts[$0].name }.joined(separator: ", ")
        scripts.remove(atOffsets: offsets)
        saveScripts()
        logger.log(.info, subsystem: .general, message: "Removed scripts: \(toRemove)")
    }

    public func delete(script: UserScript) {
        scripts.removeAll(where: { $0.id == script.id })
        saveScripts()
        logger.log(.info, subsystem: .general, message: "Deleted script: \(script.name)")
    }

    public func toggle(script: UserScript) {
        if let index = scripts.firstIndex(where: { $0.id == script.id }) {
            scripts[index].enabled.toggle()
            scripts[index].updatedAt = Date()
            saveScripts()
            logger.log(.info, subsystem: .general, message: "Toggled \(script.name) -> \(scripts[index].enabled ? "ENABLED" : "DISABLED")")
        }
    }

    public func toggleFavorite(script: UserScript) {
        if let index = scripts.firstIndex(where: { $0.id == script.id }) {
            scripts[index].favorite.toggle()
            saveScripts()
        }
    }

    public func updatePriority(script: UserScript, newPriority: Int) {
        if let index = scripts.firstIndex(where: { $0.id == script.id }) {
            scripts[index].priority = newPriority
            scripts.sort {
                if $0.priority != $1.priority {
                    return $0.priority > $1.priority
                }
                return $0.name.localizedCompare($1.name) == .orderedAscending
            }
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
        _ = storage.createBackup(of: scriptsFileName)
        
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let imported = try decoder.decode([UserScript].self, from: data)
        for s in imported {
            if let existingIndex = scripts.firstIndex(where: { $0.id == s.id || ($0.name == s.name && $0.author == s.author) }) {
                scripts[existingIndex] = s
            } else {
                scripts.append(s)
            }
        }
        saveScripts()
        logger.log(.info, subsystem: .storage, message: "Imported \(imported.count) scripts from JSON backup")
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
        // @name         Clean Auto Dark Mode
        // @version      1.0.0
        // @description  Intelligently applies dark background on web pages
        // @author       Userscript
        // @match        *://*/*
        // @run-at       document-end
        // @grant        GM_addStyle
        // ==/UserScript==

        (function() {
            'use strict';
            console.log("[Userscript] Clean Auto Dark Mode Loaded on: " + window.location.hostname);
        })();
        """

        let defaultScript = ScriptParser.parse(content: sampleScriptContent)
        scripts = [defaultScript]
        saveScripts()
    }
}
