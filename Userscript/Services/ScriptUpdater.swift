import Foundation

public final class ScriptUpdater: ObservableObject {
    public static let shared = ScriptUpdater()

    @Published public var isCheckingUpdates: Bool = false
    @Published public var availableUpdates: [UUID: String] = [:] // ScriptID: NewVersion
    @Published public var updateStatusMessage: String? = nil

    private init() {}

    public struct UpdateResult {
        public let script: UserScript
        public let hasUpdate: Bool
        public let currentVersion: String
        public let remoteVersion: String
        public let downloadURL: String?
    }

    /// Checks if a newer version is available for a script
    public func checkForUpdate(script: UserScript) async -> UpdateResult {
        guard let urlString = script.updateUrl ?? script.downloadUrl ?? script.sourceUrl,
              !urlString.isEmpty else {
            return UpdateResult(script: script, hasUpdate: false, currentVersion: script.version, remoteVersion: script.version, downloadURL: nil)
        }

        do {
            let (_, remoteContent) = try await ScriptDownloader.fetch(from: urlString)
            let remoteScript = ScriptParser.parse(content: remoteContent)
            let hasNewer = isVersion(remoteScript.version, newerThan: script.version)
            let download = remoteScript.downloadUrl ?? script.downloadUrl ?? urlString
            
            return UpdateResult(
                script: script,
                hasUpdate: hasNewer,
                currentVersion: script.version,
                remoteVersion: remoteScript.version,
                downloadURL: hasNewer ? download : nil
            )
        } catch {
            return UpdateResult(script: script, hasUpdate: false, currentVersion: script.version, remoteVersion: script.version, downloadURL: nil)
        }
    }

    /// Checks all installed scripts for updates
    public func checkAllUpdates(scripts: [UserScript]) async {
        await MainActor.run {
            self.isCheckingUpdates = true
            self.updateStatusMessage = "Checking for updates..."
        }

        var updates: [UUID: String] = [:]
        for s in scripts {
            let res = await checkForUpdate(script: s)
            if res.hasUpdate {
                updates[s.id] = res.remoteVersion
            }
        }

        let finalUpdates = updates
        await MainActor.run {
            self.availableUpdates = finalUpdates
            self.isCheckingUpdates = false
            self.updateStatusMessage = finalUpdates.isEmpty ? "All scripts up to date" : "\(finalUpdates.count) update(s) available"
        }
    }

    /// Performs the update, recording previous version in history for rollback
    public func performUpdate(script: UserScript) async throws -> UserScript {
        guard let downloadURL = script.downloadUrl ?? script.updateUrl ?? script.sourceUrl else {
            throw ScriptDownloader.DownloadError.invalidURL
        }

        let (downloaded, rawCode) = try await ScriptDownloader.fetch(from: downloadURL)
        
        var updated = script
        // Record history item
        let historyItem = UserScript.ScriptHistoryItem(
            version: script.version,
            content: script.content,
            timestamp: Date(),
            changeSummary: "Updated to v\(downloaded.version)"
        )
        updated.history.insert(historyItem, at: 0)
        
        // Update content and metadata
        updated.version = downloaded.version
        updated.content = rawCode
        updated.description = downloaded.description
        updated.matches = downloaded.matches
        updated.includes = downloaded.includes
        updated.excludes = downloaded.excludes
        updated.grants = downloaded.grants
        updated.requires = downloaded.requires
        updated.resources = downloaded.resources
        updated.runAt = downloaded.runAt
        updated.updatedAt = Date()

        await MainActor.run {
            self.availableUpdates.removeValue(forKey: script.id)
        }

        return updated
    }

    /// Performs rollback to a historical version
    public func rollback(script: inout UserScript, to historyItem: UserScript.ScriptHistoryItem) {
        let currentSnapshot = UserScript.ScriptHistoryItem(
            version: script.version,
            content: script.content,
            timestamp: Date(),
            changeSummary: "Rollback from v\(script.version) to v\(historyItem.version)"
        )
        script.history.insert(currentSnapshot, at: 0)
        script.version = historyItem.version
        script.content = historyItem.content
        let parsed = ScriptParser.parse(content: historyItem.content)
        script.matches = parsed.matches
        script.includes = parsed.includes
        script.excludes = parsed.excludes
        script.grants = parsed.grants
        script.runAt = parsed.runAt
        script.updatedAt = Date()
    }

    /// Version comparison helper (e.g. 1.2.0 > 1.1.9)
    public func isVersion(_ v1: String, newerThan v2: String) -> Bool {
        let clean1 = v1.trimmingCharacters(in: CharacterSet(charactersIn: "vV "))
        let clean2 = v2.trimmingCharacters(in: CharacterSet(charactersIn: "vV "))
        return clean1.compare(clean2, options: .numeric) == .orderedDescending
    }
}
