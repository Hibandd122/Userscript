import Foundation

public struct ScriptDependency: Identifiable, Codable, Equatable, Hashable {
    public var id: String { url }
    public var url: String
    public var fileName: String
    public var cachedContent: String?
    public var status: DependencyStatus
    public var sizeBytes: Int64
    public var lastCheckedAt: Date?
    public var integrityHash: String?

    public enum DependencyStatus: String, Codable, CaseIterable {
        case ready = "Ready"
        case downloading = "Downloading"
        case cached = "Cached"
        case brokenUrl = "Broken URL"
        case circular = "Circular Dependency"
        case invalidJS = "Invalid JS"
        case missing = "Missing"
    }

    public init(
        url: String,
        cachedContent: String? = nil,
        status: DependencyStatus = .ready,
        sizeBytes: Int64 = 0,
        lastCheckedAt: Date? = nil,
        integrityHash: String? = nil
    ) {
        self.url = url
        self.fileName = URL(string: url)?.lastPathComponent ?? "library.js"
        self.cachedContent = cachedContent
        self.status = status
        self.sizeBytes = sizeBytes
        self.lastCheckedAt = lastCheckedAt
        self.integrityHash = integrityHash
    }
}
