import Foundation

public struct DomainRule: Identifiable, Codable, Equatable, Hashable {
    public var id: UUID
    public var domainPattern: String // e.g. "youtube.com", "*.mangadex.org", "example.com/path/*"
    public var action: RuleAction
    public var targetScriptId: UUID? // nil = applies to all scripts on this domain
    public var expiresAt: Date?
    public var createdAt: Date

    public enum RuleAction: String, Codable, CaseIterable {
        case allow = "Allow"
        case block = "Block"
        case tempAllow = "Temporary Allow"
        case tempBlock = "Temporary Block"
    }

    public var isExpired: Bool {
        if let expiresAt = expiresAt {
            return Date() > expiresAt
        }
        return false
    }

    public init(
        id: UUID = UUID(),
        domainPattern: String,
        action: RuleAction,
        targetScriptId: UUID? = nil,
        expiresAt: Date? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.domainPattern = domainPattern
        self.action = action
        self.targetScriptId = targetScriptId
        self.expiresAt = expiresAt
        self.createdAt = createdAt
    }
}
