import Foundation
import Combine

public final class ScriptManager: ObservableObject {
    public static let shared = ScriptManager()
    public static let appGroupIdentifier = StorageManager.appGroupIdentifier

    @Published public var scripts: [UserScript] = []
    @Published public var domainRules: [DomainRule] = []
    @Published public var groups: [ScriptGroup] = ScriptGroup.standardGroups
    @Published public var appConfig: AppConfig = AppConfig()

    @Published public var isLoading: Bool = false
    @Published public var errorMessage: String? = nil
    @Published public var selectedTagFilter: String? = nil
    @Published public var selectedGroupFilter: String? = nil
    @Published public var showFavoritesOnly: Bool = false

    private let storage = StorageManager.shared
    private let logger = LogManager.shared

    private let scriptsFileName = "userscripts.json"
    private let indexFileName = "script_index.json"
    private let domainRulesFileName = "domain_rules.json"
    private let groupsFileName = "script_groups.json"
    private let appConfigFileName = "app_config.json"

    private init() {
        loadAll()
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

    // MARK: - Dashboard 2.0 Metrics (Phase 1)
    public var activeScriptsCount: Int {
        scripts.filter { $0.enabled }.count
    }

    public var disabledScriptsCount: Int {
        scripts.filter { !$0.enabled }.count
    }

    public var scriptsWithErrors: [UserScript] {
        scripts.filter { $0.lastError != nil || $0.statistics.failureCount > 0 }
    }

    public var needsAttentionScripts: [UserScript] {
        scripts.filter { s in
            s.statistics.consecutiveFailures >= 3 || s.lastError != nil || s.trustLevel == .unknown
        }
    }

    public var recentlyUpdatedScripts: [UserScript] {
        scripts.sorted { $0.updatedAt > $1.updatedAt }
    }

    public var recentlyUsedScripts: [UserScript] {
        scripts.filter { $0.lastExecutedAt != nil }
            .sorted { ($0.lastExecutedAt ?? Date.distantPast) > ($1.lastExecutedAt ?? Date.distantPast) }
    }

    // MARK: - Load & Save Core
    public func loadAll() {
        isLoading = true
        defer { isLoading = false }

        loadScripts()
        loadDomainRules()
        loadGroups()
        loadAppConfig()
    }

    public func loadScripts() {
        guard let data = storage.read(filename: scriptsFileName) else {
            scripts = []
            return
        }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            scripts = try decoder.decode([UserScript].self, from: data)
            sortScripts()
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

    public func loadDomainRules() {
        guard let data = storage.read(filename: domainRulesFileName) else {
            domainRules = []
            return
        }
        domainRules = (try? JSONDecoder().decode([DomainRule].self, from: data)) ?? []
    }

    public func saveDomainRules() {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(domainRules) {
            try? storage.write(data: data, to: domainRulesFileName)
            notifyExtensionReload()
        }
    }

    public func loadGroups() {
        guard let data = storage.read(filename: groupsFileName) else {
            groups = ScriptGroup.standardGroups
            return
        }
        groups = (try? JSONDecoder().decode([ScriptGroup].self, from: data)) ?? ScriptGroup.standardGroups
    }

    public func saveGroups() {
        if let data = try? JSONEncoder().encode(groups) {
            try? storage.write(data: data, to: groupsFileName)
        }
    }

    public func loadAppConfig() {
        guard let data = storage.read(filename: appConfigFileName) else {
            appConfig = AppConfig()
            return
        }
        appConfig = (try? JSONDecoder().decode(AppConfig.self, from: data)) ?? AppConfig()
    }

    public func saveAppConfig() {
        if let data = try? JSONEncoder().encode(appConfig) {
            try? storage.write(data: data, to: appConfigFileName)
            notifyExtensionReload()
        }
    }

    /// Generates lightweight index JSON for Safari Web Extension (Phase 19 & 42)
    private func generateAndSaveIndex() {
        let indexPayload = scripts.map { $0.extensionPayload }
        if let data = try? JSONSerialization.data(withJSONObject: indexPayload, options: [.prettyPrinted]) {
            try? storage.write(data: data, to: indexFileName)
        }
    }

    private func sortScripts() {
        scripts.sort {
            if $0.priority != $1.priority {
                return $0.priority > $1.priority
            }
            return $0.name.localizedCompare($1.name) == .orderedAscending
        }
    }

    // MARK: - Script CRUD
    public func add(script: UserScript) {
        var s = script
        autoTag(script: &s)
        if let index = scripts.firstIndex(where: { $0.id == s.id }) {
            scripts[index] = s
        } else {
            scripts.append(s)
        }
        sortScripts()
        saveScripts()
        logger.log(.info, subsystem: .general, message: "Added/Updated script: \(s.name) (v\(s.version))")
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
            sortScripts()
            saveScripts()
        }
    }

    // MARK: - Emergency Disable (Phase 50)
    public func toggleEmergencyDisable() {
        appConfig.emergencyDisableAll.toggle()
        saveAppConfig()
        logger.log(.warning, subsystem: .general, message: "Emergency Disable set to: \(appConfig.emergencyDisableAll)")
    }

    // MARK: - Domain Rules Management (Phase 3 & 4)
    public func addDomainRule(pattern: String, action: DomainRule.RuleAction, targetScriptId: UUID? = nil, durationMinutes: Int? = nil) {
        let expiresAt = durationMinutes != nil ? Date().addingTimeInterval(Double(durationMinutes!) * 60) : nil
        let rule = DomainRule(domainPattern: pattern, action: action, targetScriptId: targetScriptId, expiresAt: expiresAt)
        domainRules.removeAll { $0.domainPattern == pattern && $0.targetScriptId == targetScriptId }
        domainRules.append(rule)
        saveDomainRules()
    }

    public func removeDomainRule(_ rule: DomainRule) {
        domainRules.removeAll { $0.id == rule.id }
        saveDomainRules()
    }

    // MARK: - Script Groups Bulk Operations (Phase 8)
    public func toggleGroup(groupId: String, enable: Bool) {
        for i in 0..<scripts.count {
            if scripts[i].group == groupId {
                scripts[i].enabled = enable
            }
        }
        if let gIndex = groups.firstIndex(where: { $0.id == groupId }) {
            groups[gIndex].enabled = enable
            saveGroups()
        }
        saveScripts()
    }

    // MARK: - Automatic Tagging (Phase 42)
    public func autoTag(script: inout UserScript) {
        var tags = Set(script.tags)
        let lower = (script.name + " " + script.description + " " + script.matches.joined(separator: " ")).lowercased()
        if lower.contains("youtube") || lower.contains("video") || lower.contains("shorts") {
            tags.insert("Video")
            if script.group == nil { script.group = "youtube" }
        }
        if lower.contains("manga") || lower.contains("comic") || lower.contains("truyen") || lower.contains("anime") {
            tags.insert("Anime & Manga")
            if script.group == nil { script.group = "anime" }
        }
        if lower.contains("reddit") || lower.contains("twitter") || lower.contains("facebook") || lower.contains("social") {
            tags.insert("Social")
            if script.group == nil { script.group = "social" }
        }
        if lower.contains("adblock") || lower.contains("cleaner") || lower.contains("dark") || lower.contains("theme") {
            tags.insert("Tools")
            if script.group == nil { script.group = "productivity" }
        }
        if lower.contains("debug") || lower.contains("dev") || lower.contains("inspect") {
            tags.insert("Developer")
            if script.group == nil { script.group = "developer" }
        }
        script.tags = Array(tags).sorted()
    }

    // MARK: - Match Tester Service (Phase 39)
    public struct MatchTestResult: Identifiable {
        public var id: UUID { script.id }
        public let script: UserScript
        public let isMatched: Bool
        public let reason: String
    }

    public func testMatches(for urlString: String) -> [MatchTestResult] {
        guard let url = URL(string: urlString) else { return [] }
        let host = url.host ?? urlString
        var results: [MatchTestResult] = []

        for script in scripts {
            var matched = false
            var reason = "No pattern matched"

            // Check Excludes
            var isExcluded = false
            for exc in script.excludes {
                if wildcardMatch(urlString, pattern: exc) || wildcardMatch(host, pattern: exc) {
                    isExcluded = true
                    reason = "Blocked by @exclude '\(exc)'"
                    break
                }
            }

            if !isExcluded {
                for m in script.matches {
                    if m == "<all_urls>" || wildcardMatch(urlString, pattern: m) || wildcardMatch(host, pattern: m) {
                        matched = true
                        reason = "Matched @match '\(m)'"
                        break
                    }
                }
                if !matched {
                    for inc in script.includes {
                        if wildcardMatch(urlString, pattern: inc) || wildcardMatch(host, pattern: inc) {
                            matched = true
                            reason = "Matched @include '\(inc)'"
                            break
                        }
                    }
                }
            }

            results.append(MatchTestResult(script: script, isMatched: matched && !isExcluded, reason: reason))
        }

        return results
    }

    private func wildcardMatch(_ text: String, pattern: String) -> Bool {
        var p = pattern.replacingOccurrences(of: "*://", with: "https?://")
        p = p.replacingOccurrences(of: ".", with: "\\.")
        p = p.replacingOccurrences(of: "*", with: ".*")
        let regex = try? NSRegularExpression(pattern: "^" + p + "$", options: .caseInsensitive)
        let range = NSRange(location: 0, length: text.utf16.count)
        return regex?.firstMatch(in: text, options: [], range: range) != nil
    }

    // MARK: - Import / Export
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
        sortScripts()
        saveScripts()
        logger.log(.info, subsystem: .storage, message: "Imported \(imported.count) scripts from JSON backup")
    }

    public func importScript(from fileURL: URL) throws -> UserScript {
        let isSecured = fileURL.startAccessingSecurityScopedResource()
        defer {
            if isSecured {
                fileURL.stopAccessingSecurityScopedResource()
            }
        }
        
        let content = try String(contentsOf: fileURL, encoding: .utf8)
        let parsed = ScriptParser.parse(content: content, sourceUrl: fileURL.lastPathComponent)
        add(script: parsed)
        logger.log(.info, subsystem: .general, message: "Imported script from file: \(fileURL.lastPathComponent)")
        return parsed
    }

    private func notifyExtensionReload() {
        #if canImport(CoreFoundation)
        let notificationCenter = CFNotificationCenterGetDarwinNotifyCenter()
        let notificationName = CFNotificationName("com.userscript.reloadScripts" as CFString)
        CFNotificationCenterPostNotification(notificationCenter, notificationName, nil, nil, true)
        #endif
    }

    private func installDefaultScripts() {
        var defaultList: [UserScript] = []

        // 1. Manga Universal Pro (Offline Bundle)
        if let bundleURL = Bundle.main.url(forResource: "MangaUniversalPro.bundle.user", withExtension: "js"),
           let content = try? String(contentsOf: bundleURL, encoding: .utf8) {
            var mangaScript = ScriptParser.parse(content: content, sourceUrl: "MangaUniversalPro.bundle.user.js")
            mangaScript.group = "anime"
            mangaScript.trustLevel = .trusted
            autoTag(script: &mangaScript)
            defaultList.append(mangaScript)
        }

        // 2. Clean Auto Dark Mode
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

        var defaultScript = ScriptParser.parse(content: sampleScriptContent)
        defaultScript.group = "productivity"
        defaultScript.trustLevel = .local
        autoTag(script: &defaultScript)
        defaultList.append(defaultScript)

        scripts = defaultList
        saveScripts()
    }
}
