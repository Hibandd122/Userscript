import Foundation

public struct UserScript: Identifiable, Codable, Equatable, Hashable {
    public var id: UUID
    public var name: String
    public var version: String
    public var description: String
    public var author: String
    public var enabled: Bool
    public var content: String
    public var matches: [String]
    public var includes: [String]
    public var excludes: [String]
    public var grants: [String]
    public var runAt: RunAt
    public var sourceUrl: String?
    public var updateUrl: String?
    public var downloadUrl: String?
    public var createdAt: Date
    public var updatedAt: Date

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

    public init(
        id: UUID = UUID(),
        name: String,
        version: String = "1.0.0",
        description: String = "",
        author: String = "",
        enabled: Bool = true,
        content: String,
        matches: [String] = ["*://*/*"],
        includes: [String] = [],
        excludes: [String] = [],
        grants: [String] = ["none"],
        runAt: RunAt = .documentEnd,
        sourceUrl: String? = nil,
        updateUrl: String? = nil,
        downloadUrl: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.version = version
        self.description = description
        self.author = author
        self.enabled = enabled
        self.content = content
        self.matches = matches
        self.includes = includes
        self.excludes = excludes
        self.grants = grants
        self.runAt = runAt
        self.sourceUrl = sourceUrl
        self.updateUrl = updateUrl
        self.downloadUrl = downloadUrl
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
