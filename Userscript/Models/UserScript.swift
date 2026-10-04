import Foundation

public struct UserScript: Identifiable, Codable, Equatable, Hashable {
    public var id: UUID
    public var name: String
    public var namespace: String
    public var version: String
    public var description: String
    public var author: String
    public var enabled: Bool
    public var priority: Int
    public var favorite: Bool
    public var isFavorite: Bool {
        get { favorite }
        set { favorite = newValue }
    }
    public var tags: [String]
    public var content: String
    public var matches: [String]
    public var includes: [String]
    public var excludes: [String]
    public var grants: [String]
    public var requires: [String]
    public var resources: [ScriptResource]
    public var runAt: RunAt
    public var noframes: Bool
    public var iconURL: String?
    public var sourceUrl: String?
    public var updateUrl: String?
    public var downloadUrl: String?
    public var history: [ScriptHistoryItem]
    public var storageData: [String: String]
    public var createdAt: Date
    public var updatedAt: Date
    public var lastExecutedAt: Date?
    public var executionCount: Int
    public var lastError: String?

    public enum RunAt: String, Codable, CaseIterable {
        case documentStart = "document-start"
        case documentBody = "document-body"
        case documentEnd = "document-end"
        case documentIdle = "document-idle"

        public var title: String {
            switch self {
            case .documentStart: return "Document Start"
            case .documentBody: return "Document Body"
            case .documentEnd: return "Document End"
            case .documentIdle: return "Document Idle"
            }
        }
    }

    public struct ScriptResource: Codable, Equatable, Hashable, Identifiable {
        public var id: String { name }
        public var name: String
        public var url: String
        public var cachedContent: String?

        public init(name: String, url: String, cachedContent: String? = nil) {
            self.name = name
            self.url = url
            self.cachedContent = cachedContent
        }
    }

    public struct ScriptHistoryItem: Codable, Equatable, Hashable, Identifiable {
        public var id: UUID
        public var version: String
        public var content: String
        public var timestamp: Date
        public var changeSummary: String?

        public init(id: UUID = UUID(), version: String, content: String, timestamp: Date = Date(), changeSummary: String? = nil) {
            self.id = id
            self.version = version
            self.content = content
            self.timestamp = timestamp
            self.changeSummary = changeSummary
        }
    }

    public init(
        id: UUID = UUID(),
        name: String,
        namespace: String = "",
        version: String = "1.0.0",
        description: String = "",
        author: String = "",
        enabled: Bool = true,
        priority: Int = 100,
        favorite: Bool = false,
        tags: [String] = [],
        content: String,
        matches: [String] = ["*://*/*"],
        includes: [String] = [],
        excludes: [String] = [],
        grants: [String] = ["none"],
        requires: [String] = [],
        resources: [ScriptResource] = [],
        runAt: RunAt = .documentEnd,
        noframes: Bool = false,
        iconURL: String? = nil,
        sourceUrl: String? = nil,
        updateUrl: String? = nil,
        downloadUrl: String? = nil,
        history: [ScriptHistoryItem] = [],
        storageData: [String: String] = [:],
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        lastExecutedAt: Date? = nil,
        executionCount: Int = 0,
        lastError: String? = nil
    ) {
        self.id = id
        self.name = name
        self.namespace = namespace
        self.version = version
        self.description = description
        self.author = author
        self.enabled = enabled
        self.priority = priority
        self.favorite = favorite
        self.tags = tags
        self.content = content
        self.matches = matches
        self.includes = includes
        self.excludes = excludes
        self.grants = grants
        self.requires = requires
        self.resources = resources
        self.runAt = runAt
        self.noframes = noframes
        self.iconURL = iconURL
        self.sourceUrl = sourceUrl
        self.updateUrl = updateUrl
        self.downloadUrl = downloadUrl
        self.history = history
        self.storageData = storageData
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastExecutedAt = lastExecutedAt
        self.executionCount = executionCount
        self.lastError = lastError
    }

    /// Generates minimal dictionary for fast extension indexing
    public var extensionPayload: [String: Any] {
        return [
            "id": id.uuidString,
            "name": name,
            "version": version,
            "enabled": enabled,
            "priority": priority,
            "runAt": runAt.rawValue,
            "matches": matches,
            "includes": includes,
            "excludes": excludes,
            "grants": grants,
            "noframes": noframes,
            "content": content,
            "resources": resources.map { ["name": $0.name, "url": $0.url, "content": $0.cachedContent ?? ""] }
        ]
    }
}
