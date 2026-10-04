import Foundation

public final class StorageManager {
    public static let shared = StorageManager()
    public static let appGroupIdentifier = "group.com.userscript.app"

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
    }

    private let fileManager = FileManager.default

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

    private init() {}

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
        guard let files = try? fileManager.contentsOfDirectory(at: backupsDirectory, includingPropertiesForKeys: [.contentModificationDateKey]) else {
            return []
        }
        return files.filter { $0.pathExtension == "json" || $0.lastPathComponent.hasPrefix("backup_") }
            .sorted { ($0.lastPathComponent) > ($1.lastPathComponent) }
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
            backupCount: listBackups().count
        )
    }
}
