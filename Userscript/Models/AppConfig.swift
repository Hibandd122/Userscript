import Foundation

public struct AppConfig: Codable, Equatable {
    public var emergencyDisableAll: Bool
    public var safeMode: Bool
    public var safeModeOption: SafeModeOption
    public var performanceMode: PerformanceMode
    public var theme: AppTheme
    public var featureFlags: FeatureFlags

    public enum SafeModeOption: String, Codable, CaseIterable {
        case disableAll = "Disable All Scripts"
        case onlyTrusted = "Only Trusted Scripts"
        case onlySelectedGroup = "Only Selected Group"
    }

    public enum PerformanceMode: String, Codable, CaseIterable {
        case balanced = "Balanced"
        case performance = "Performance (Low Overhead)"
        case debug = "Debug (Full Diagnostics)"
    }

    public enum AppTheme: String, Codable, CaseIterable {
        case system = "System Native"
        case light = "Light"
        case dark = "Dark"
        case minimal = "Minimal"
        case glass = "Glassmorphic"
        case compact = "Compact"
    }

    public struct FeatureFlags: Codable, Equatable {
        public var advancedDebugger: Bool = true
        public var spaNavigation: Bool = true
        public var dependencyGraph: Bool = true
        public var scriptRecovery: Bool = true
        public var experimentalInjector: Bool = false

        public init(
            advancedDebugger: Bool = true,
            spaNavigation: Bool = true,
            dependencyGraph: Bool = true,
            scriptRecovery: Bool = true,
            experimentalInjector: Bool = false
        ) {
            self.advancedDebugger = advancedDebugger
            self.spaNavigation = spaNavigation
            self.dependencyGraph = dependencyGraph
            self.scriptRecovery = scriptRecovery
            self.experimentalInjector = experimentalInjector
        }
    }

    public init(
        emergencyDisableAll: Bool = false,
        safeMode: Bool = false,
        safeModeOption: SafeModeOption = .disableAll,
        performanceMode: PerformanceMode = .balanced,
        theme: AppTheme = .system,
        featureFlags: FeatureFlags = FeatureFlags()
    ) {
        self.emergencyDisableAll = emergencyDisableAll
        self.safeMode = safeMode
        self.safeModeOption = safeModeOption
        self.performanceMode = performanceMode
        self.theme = theme
        self.featureFlags = featureFlags
    }
}
