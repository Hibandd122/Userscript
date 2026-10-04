import Foundation

public final class LogManager: ObservableObject {
    public static let shared = LogManager()

    public enum LogLevel: String, Codable, CaseIterable {
        case debug = "DEBUG"
        case info = "INFO"
        case warning = "WARN"
        case error = "ERROR"

        public var emoji: String {
            switch self {
            case .debug: return "🔍"
            case .info: return "ℹ️"
            case .warning: return "⚠️"
            case .error: return "🛑"
            }
        }
    }

    public enum Subsystem: String, Codable, CaseIterable {
        case general = "Userscript"
        case injector = "Injector"
        case matcher = "Matcher"
        case bridge = "Bridge"
        case gmApi = "GM API"
        case network = "Network"
        case storage = "Storage"
    }

    public struct LogEntry: Identifiable, Codable {
        public let id: UUID
        public let timestamp: Date
        public let level: LogLevel
        public let subsystem: Subsystem
        public let message: String
        public let details: String?

        public init(id: UUID = UUID(), timestamp: Date = Date(), level: LogLevel, subsystem: Subsystem, message: String, details: String? = nil) {
            self.id = id
            self.timestamp = timestamp
            self.level = level
            self.subsystem = subsystem
            self.message = message
            self.details = details
        }
    }

    @Published public private(set) var entries: [LogEntry] = []
    private let maxEntries = 500

    private init() {
        log(.info, subsystem: .general, message: "Userscript Runtime & Diagnostic Engine Started")
    }

    public func log(_ level: LogLevel, subsystem: Subsystem, message: String, details: String? = nil) {
        let entry = LogEntry(level: level, subsystem: subsystem, message: message, details: details)
        DispatchQueue.main.async {
            self.entries.append(entry)
            if self.entries.count > self.maxEntries {
                self.entries.removeFirst(self.entries.count - self.maxEntries)
            }
        }
        #if DEBUG
        print("[\(entry.subsystem.rawValue)] [\(entry.level.rawValue)] \(message)")
        #endif
    }

    public func clear() {
        DispatchQueue.main.async {
            self.entries.removeAll()
        }
    }

    public func exportLogsAsPlainText() -> String {
        let formatter = ISO8601DateFormatter()
        return entries.map { entry in
            let dateStr = formatter.string(from: entry.timestamp)
            var line = "[\(dateStr)] [\(entry.level.rawValue)] [\(entry.subsystem.rawValue)]: \(entry.message)"
            if let details = entry.details {
                line += " | Details: \(details)"
            }
            return line
        }.joined(separator: "\n")
    }
}
