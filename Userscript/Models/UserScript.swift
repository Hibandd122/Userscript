import Foundation
import CryptoKit

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
    public var group: String?
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
    public var siteSettings: [String: [String: String]] // Site-specific storage/preferences
    public var configSchema: [ScriptConfigField]
    public var trustLevel: TrustLevel
    public var sha256Hash: String
    public var autoUpdateMode: AutoUpdateMode
    public var spaMode: SPANavigationMode
    public var statistics: ScriptStatistics
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

    public enum TrustLevel: String, Codable, CaseIterable {
        case trusted = "Trusted"
        case knownSource = "Known Source"
        case unknown = "Unknown"
        case modified = "Modified"
        case local = "Local"
    }

    public enum AutoUpdateMode: String, Codable, CaseIterable {
        case auto = "Auto Update"
        case ask = "Ask Before Update"
        case manual = "Manual Only"
    }

    public enum SPANavigationMode: String, Codable, CaseIterable {
        case runOncePerPage = "Once Per Page"
        case runOncePerUrl = "Once Per Unique URL"
        case runOnEveryNavigation = "Every Navigation"
    }

    public struct ScriptStatistics: Codable, Equatable, Hashable {
        public var timesMatched: Int = 0
        public var timesExecuted: Int = 0
        public var failureCount: Int = 0
        public var consecutiveFailures: Int = 0
        public var lastRunAt: Date? = nil
        public var lastError: String? = nil
        public var domainsUsed: [String] = []

        public init(
            timesMatched: Int = 0,
            timesExecuted: Int = 0,
            failureCount: Int = 0,
            consecutiveFailures: Int = 0,
            lastRunAt: Date? = nil,
            lastError: String? = nil,
            domainsUsed: [String] = []
        ) {
            self.timesMatched = timesMatched
            self.timesExecuted = timesExecuted
            self.failureCount = failureCount
            self.consecutiveFailures = consecutiveFailures
            self.lastRunAt = lastRunAt
            self.lastError = lastError
            self.domainsUsed = domainsUsed
        }
    }

    public struct ScriptConfigField: Codable, Equatable, Hashable, Identifiable {
        public var id: String { key }
        public var key: String
        public var label: String
        public var type: ConfigType
        public var defaultValue: String
        public var currentValue: String
        public var options: [String]? // For .select

        public enum ConfigType: String, Codable, CaseIterable {
            case toggle = "toggle"
            case number = "number"
            case text = "text"
            case select = "select"
            case color = "color"
            case url = "url"
        }

        public init(key: String, label: String, type: ConfigType, defaultValue: String, currentValue: String? = nil, options: [String]? = nil) {
            self.key = key
            self.label = label
            self.type = type
            self.defaultValue = defaultValue
            self.currentValue = currentValue ?? defaultValue
            self.options = options
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

    public static func computeHash(for text: String) -> String {
        let inputData = Data(text.utf8)
        let hashed = SHA256.hash(data: inputData)
        return hashed.compactMap { String(format: "%02x", $0) }.joined()
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
        group: String? = nil,
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
        siteSettings: [String: [String: String]] = [:],
        configSchema: [ScriptConfigField] = [],
        trustLevel: TrustLevel = .local,
        sha256Hash: String? = nil,
        autoUpdateMode: AutoUpdateMode = .ask,
        spaMode: SPANavigationMode = .runOncePerPage,
        statistics: ScriptStatistics = ScriptStatistics(),
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
        self.group = group
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
        self.siteSettings = siteSettings
        self.configSchema = configSchema
        self.trustLevel = trustLevel
        self.sha256Hash = sha256Hash ?? Self.computeHash(for: content)
        self.autoUpdateMode = autoUpdateMode
        self.spaMode = spaMode
        self.statistics = statistics
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastExecutedAt = lastExecutedAt
        self.executionCount = executionCount
        self.lastError = lastError
    }

    // Custom Decodable to support seamless backward compatibility with older v1 schemas
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        self.name = try container.decodeIfPresent(String.self, forKey: .name) ?? "Untitled Script"
        self.namespace = try container.decodeIfPresent(String.self, forKey: .namespace) ?? ""
        self.version = try container.decodeIfPresent(String.self, forKey: .version) ?? "1.0.0"
        self.description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
        self.author = try container.decodeIfPresent(String.self, forKey: .author) ?? ""
        self.enabled = try container.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        self.priority = try container.decodeIfPresent(Int.self, forKey: .priority) ?? 100
        self.favorite = try container.decodeIfPresent(Bool.self, forKey: .favorite) ?? false
        self.tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
        self.group = try container.decodeIfPresent(String.self, forKey: .group)
        self.content = try container.decodeIfPresent(String.self, forKey: .content) ?? ""
        self.matches = try container.decodeIfPresent([String].self, forKey: .matches) ?? ["*://*/*"]
        self.includes = try container.decodeIfPresent([String].self, forKey: .includes) ?? []
        self.excludes = try container.decodeIfPresent([String].self, forKey: .excludes) ?? []
        self.grants = try container.decodeIfPresent([String].self, forKey: .grants) ?? ["none"]
        self.requires = try container.decodeIfPresent([String].self, forKey: .requires) ?? []
        self.resources = try container.decodeIfPresent([ScriptResource].self, forKey: .resources) ?? []
        self.runAt = try container.decodeIfPresent(RunAt.self, forKey: .runAt) ?? .documentEnd
        self.noframes = try container.decodeIfPresent(Bool.self, forKey: .noframes) ?? false
        self.iconURL = try container.decodeIfPresent(String.self, forKey: .iconURL)
        self.sourceUrl = try container.decodeIfPresent(String.self, forKey: .sourceUrl)
        self.updateUrl = try container.decodeIfPresent(String.self, forKey: .updateUrl)
        self.downloadUrl = try container.decodeIfPresent(String.self, forKey: .downloadUrl)
        self.history = try container.decodeIfPresent([ScriptHistoryItem].self, forKey: .history) ?? []
        self.storageData = try container.decodeIfPresent([String: String].self, forKey: .storageData) ?? [:]
        self.siteSettings = try container.decodeIfPresent([String: [String: String]].self, forKey: .siteSettings) ?? [:]
        self.configSchema = try container.decodeIfPresent([ScriptConfigField].self, forKey: .configSchema) ?? []
        self.trustLevel = try container.decodeIfPresent(TrustLevel.self, forKey: .trustLevel) ?? .local
        self.sha256Hash = try container.decodeIfPresent(String.self, forKey: .sha256Hash) ?? Self.computeHash(for: self.content)
        self.autoUpdateMode = try container.decodeIfPresent(AutoUpdateMode.self, forKey: .autoUpdateMode) ?? .ask
        self.spaMode = try container.decodeIfPresent(SPANavigationMode.self, forKey: .spaMode) ?? .runOncePerPage
        self.statistics = try container.decodeIfPresent(ScriptStatistics.self, forKey: .statistics) ?? ScriptStatistics()
        self.createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        self.updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? Date()
        self.lastExecutedAt = try container.decodeIfPresent(Date.self, forKey: .lastExecutedAt)
        self.executionCount = try container.decodeIfPresent(Int.self, forKey: .executionCount) ?? 0
        self.lastError = try container.decodeIfPresent(String.self, forKey: .lastError)
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
            "spaMode": spaMode.rawValue,
            "siteSettings": siteSettings,
            "resources": resources.map { ["name": $0.name, "url": $0.url, "content": $0.cachedContent ?? ""] }
        ]
    }
}
