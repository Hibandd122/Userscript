import Foundation

public final class StorageManager {
    public static let shared = StorageManager()
    public static let appGroupIdentifier = "group.com.userscript.app"
    public static let currentSchemaVersion = 2

    public enum StorageType: String, Codable {
        case appGroup = "App Group (Shared)"
        case sandbox = "Sandbox Documents (Local Fallback)"
    }

    public struct StorageHealthReport: Codable {
        public let type: StorageType
        public let directoryPath: String
        public let isWritable: Bool
        public let totalFiles: Int
        public let databaseSizeBytes: Int64
        public let backupCount: Int
        public let schemaVersion: Int
    }

    public struct CleanupCandidateReport: Codable {
        public let backupFilesCount: Int
        public let backupFilesSizeBytes: Int64
        public let tempFilesCount: Int
        public let tempFilesSizeBytes: Int64
        public let totalReclaimableBytes: Int64
    }

    private let fileManager = FileManager.default
    private let schemaVersionKey = "userscript_storage_schema_version"

    public var activeStorageType: StorageType {
        if fileManager.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) != nil {
            return .appGroup
        }
        return .sandbox
    }

    public var rootDirectory: URL {
        if let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) {
            return groupURL
        }
        return fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    public var backupsDirectory: URL {
        let dir = rootDirectory.appendingPathComponent("Backups", isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    public var cacheDirectory: URL {
        let dir = rootDirectory.appendingPathComponent("Caches", isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private init() {
        performMigrationIfNeeded()
    }

    public func fileURL(for filename: String) -> URL {
        rootDirectory.appendingPathComponent(filename)
    }

    public func read(filename: String) -> Data? {
        let url = fileURL(for: filename)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try? Data(contentsOf: url)
    }

    public func write(data: Data, to filename: String) throws {
        let url = fileURL(for: filename)
        try data.write(to: url, options: [.atomicWrite])
    }

    public func delete(filename: String) throws {
        let url = fileURL(for: filename)
        if fileManager.fileExists(atPath: url.path) {
            try fileManager.removeItem(at: url)
        }
    }

    public func exists(filename: String) -> Bool {
        fileManager.fileExists(atPath: fileURL(for: filename).path)
    }

    public func createBackup(of filename: String) -> URL? {
        guard let data = read(filename: filename) else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withYear, .withMonth, .withDay, .withTime, .withDashSeparatorInDate]
        let timestamp = formatter.string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let backupName = "backup_\(timestamp)_\(filename)"
        let backupURL = backupsDirectory.appendingPathComponent(backupName)
        
        do {
            try data.write(to: backupURL, options: [.atomicWrite])
            return backupURL
        } catch {
            print("[StorageManager] Failed to create backup: \(error)")
            return nil
        }
    }

    public func listBackups() -> [URL] {
        guard let files = try? fileManager.contentsOfDirectory(at: backupsDirectory, includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]) else {
            return []
        }
        return files.filter { $0.pathExtension == "json" || $0.lastPathComponent.hasPrefix("backup_") }
            .sorted { ($0.lastPathComponent) > ($1.lastPathComponent) }
    }

    // Phase 45: Schema Migration with Automatic Snapshot & Rollback
    private func performMigrationIfNeeded() {
        let storedVersion = UserDefaults.standard.integer(forKey: schemaVersionKey)
        if storedVersion == 0 {
            // First install or upgrade from v1
            if exists(filename: "userscripts.json") {
                _ = createBackup(of: "userscripts.json")
            }
            UserDefaults.standard.set(Self.currentSchemaVersion, forKey: schemaVersionKey)
        } else if storedVersion < Self.currentSchemaVersion {
            let snapshotURL = createBackup(of: "userscripts.json")
            do {
                // Migration logic: UserScript models use backward-compatible Decodable
                UserDefaults.standard.set(Self.currentSchemaVersion, forKey: schemaVersionKey)
                print("[StorageManager] Successfully migrated schema from v\(storedVersion) to v\(Self.currentSchemaVersion)")
            } catch {
                print("[StorageManager] Migration failed, restoring snapshot...")
                if let snapshotURL = snapshotURL, let originalData = try? Data(contentsOf: snapshotURL) {
                    try? write(data: originalData, to: "userscripts.json")
                }
            }
        }
    }

    // Phase 43: Storage Cleanup Center Analysis
    public func scanCleanupCandidates() -> CleanupCandidateReport {
        var backupCount = 0
        var backupBytes: Int64 = 0
        for b in listBackups() {
            backupCount += 1
            if let attrs = try? fileManager.attributesOfItem(atPath: b.path),
               let size = attrs[.size] as? Int64 {
                backupBytes += size
            }
        }

        var tempCount = 0
        var tempBytes: Int64 = 0
        if let cacheFiles = try? fileManager.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: [.fileSizeKey]) {
            for c in cacheFiles {
                tempCount += 1
                if let attrs = try? fileManager.attributesOfItem(atPath: c.path),
                   let size = attrs[.size] as? Int64 {
                    tempBytes += size
                }
            }
        }

        return CleanupCandidateReport(
            backupFilesCount: backupCount,
            backupFilesSizeBytes: backupBytes,
            tempFilesCount: tempCount,
            tempFilesSizeBytes: tempBytes,
            totalReclaimableBytes: backupBytes + tempBytes
        )
    }

    public func cleanAllSafeItems() -> Int64 {
        var reclaimed: Int64 = 0
        let backups = listBackups()
        // Keep the latest 2 backups, delete older
        if backups.count > 2 {
            for b in backups.dropFirst(2) {
                if let attrs = try? fileManager.attributesOfItem(atPath: b.path),
                   let size = attrs[.size] as? Int64 {
                    reclaimed += size
                }
                try? fileManager.removeItem(at: b)
            }
        }

        // Clean cache directory
        if let cacheFiles = try? fileManager.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: nil) {
            for c in cacheFiles {
                if let attrs = try? fileManager.attributesOfItem(atPath: c.path),
                   let size = attrs[.size] as? Int64 {
                    reclaimed += size
                }
                try? fileManager.removeItem(at: c)
            }
        }

        return reclaimed
    }

    public func checkHealth() -> StorageHealthReport {
        let path = rootDirectory.path
        let testFile = rootDirectory.appendingPathComponent(".health_check_test")
        var isWritable = false
        if let testData = "ok".data(using: .utf8) {
            do {
                try testData.write(to: testFile)
                try fileManager.removeItem(at: testFile)
                isWritable = true
            } catch {
                isWritable = false
            }
        }

        var totalFiles = 0
        var dbSize: Int64 = 0
        if let files = try? fileManager.contentsOfDirectory(atPath: path) {
            totalFiles = files.count
            for f in files {
                let p = (path as NSString).appendingPathComponent(f)
                if let attrs = try? fileManager.attributesOfItem(atPath: p),
                   let size = attrs[.size] as? Int64 {
                    dbSize += size
                }
            }
        }

        return StorageHealthReport(
            type: activeStorageType,
            directoryPath: path,
            isWritable: isWritable,
            totalFiles: totalFiles,
            databaseSizeBytes: dbSize,
            backupCount: listBackups().count,
            schemaVersion: UserDefaults.standard.integer(forKey: schemaVersionKey)
        )
    }
}
