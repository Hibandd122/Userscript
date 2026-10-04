import Foundation

public struct ScriptGroup: Identifiable, Codable, Equatable, Hashable {
    public var id: String
    public var name: String
    public var icon: String
    public var description: String
    public var enabled: Bool

    public init(id: String, name: String, icon: String = "folder", description: String = "", enabled: Bool = true) {
        self.id = id
        self.name = name
        self.icon = icon
        self.description = description
        self.enabled = enabled
    }

    public static let standardGroups: [ScriptGroup] = [
        ScriptGroup(id: "youtube", name: "YouTube Tools", icon: "play.rectangle.fill", description: "Enhancements for YouTube and video platforms"),
        ScriptGroup(id: "anime", name: "Anime & Manga", icon: "book.fill", description: "Manga readers, adblockers, and cleaners"),
        ScriptGroup(id: "social", name: "Social Media", icon: "bubble.left.and.bubble.right.fill", description: "Twitter/X, Reddit, Facebook modifications"),
        ScriptGroup(id: "productivity", name: "Productivity", icon: "bolt.fill", description: "Automation and workflow boosters"),
        ScriptGroup(id: "developer", name: "Developer", icon: "curlybraces", description: "Inspection and debugging tools"),
        ScriptGroup(id: "experimental", name: "Experimental", icon: "flask.fill", description: "Beta and testing scripts")
    ]
}
