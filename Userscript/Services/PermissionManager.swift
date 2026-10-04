import Foundation

public struct PermissionManager {
    public enum Capability: String, CaseIterable, Identifiable {
        case network = "Cross-Origin Network"
        case storage = "Persistent Storage"
        case dom = "DOM & Styling Injection"
        case clipboard = "Clipboard Access"
        case notification = "System Notifications"
        case tabs = "Tab Control"
        case unsafeWindow = "Unsafe Window Context"
        case none = "No Special Permissions"

        public var id: String { rawValue }

        public var iconName: String {
            switch self {
            case .network: return "network"
            case .storage: return "cylinder.split.1x2"
            case .dom: return "paintbrush.fill"
            case .clipboard: return "doc.on.clipboard"
            case .notification: return "bell.fill"
            case .tabs: return "square.on.square"
            case .unsafeWindow: return "exclamationmark.triangle.fill"
            case .none: return "checkmark.shield.fill"
            }
        }

        public var description: String {
            switch self {
            case .network: return "Allows this script to make HTTP/HTTPS network requests beyond the website domain (GM_xmlhttpRequest)."
            case .storage: return "Allows storing persistent key-value data across page reloads (GM_setValue, GM_getValue)."
            case .dom: return "Allows adding custom CSS styles and HTML elements directly into the page (GM_addStyle)."
            case .clipboard: return "Allows copying text to the system clipboard (GM_setClipboard)."
            case .notification: return "Allows displaying system-level user notifications (GM_notification)."
            case .tabs: return "Allows opening or closing browser tabs (GM_openInTab)."
            case .unsafeWindow: return "Allows direct access to the web page's raw JavaScript context (unsafeWindow)."
            case .none: return "This script runs in sandbox with zero elevated privileges."
            }
        }

        public var riskLevel: RiskLevel {
            switch self {
            case .unsafeWindow: return .high
            case .network: return .medium
            case .clipboard, .storage, .tabs: return .low
            case .dom, .notification, .none: return .safe
            }
        }
    }

    public enum RiskLevel: String {
        case safe = "Safe"
        case low = "Low Risk"
        case medium = "Moderate"
        case high = "High Risk"

        public var colorName: String {
            switch self {
            case .safe: return "green"
            case .low: return "blue"
            case .medium: return "orange"
            case .high: return "red"
            }
        }
    }

    public static func analyze(grants: [String]) -> [Capability] {
        var capabilities = Set<Capability>()

        for grant in grants {
            let g = grant.trimmingCharacters(in: .whitespaces).lowercased()
            if g == "none" || g.isEmpty {
                capabilities.insert(.none)
                continue
            }
            if g.contains("xmlhttprequest") {
                capabilities.insert(.network)
            } else if g.contains("value") || g.contains("storage") {
                capabilities.insert(.storage)
            } else if g.contains("style") || g.contains("element") {
                capabilities.insert(.dom)
            } else if g.contains("clipboard") {
                capabilities.insert(.clipboard)
            } else if g.contains("notification") {
                capabilities.insert(.notification)
            } else if g.contains("tab") {
                capabilities.insert(.tabs)
            } else if g.contains("unsafewindow") {
                capabilities.insert(.unsafeWindow)
            }
        }

        if capabilities.isEmpty {
            capabilities.insert(.none)
        }

        return Array(capabilities).sorted { $0.rawValue < $1.rawValue }
    }

    public static func calculateOverallRisk(capabilities: [Capability]) -> RiskLevel {
        if capabilities.contains(where: { $0.riskLevel == .high }) { return .high }
        if capabilities.contains(where: { $0.riskLevel == .medium }) { return .medium }
        if capabilities.contains(where: { $0.riskLevel == .low }) { return .low }
        return .safe
    }
}
