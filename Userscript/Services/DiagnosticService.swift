import Foundation
#if canImport(UIKit)
import UIKit
#endif

public struct DiagnosticReport: Identifiable {
    public var id = UUID()
    public let appVersion: String
    public let buildNumber: String
    public let osVersion: String
    public let deviceModel: String
    public let storageType: String
    public let storageWritable: Bool
    public let storageSizeBytes: Int64
    public let totalScripts: Int
    public let activeScripts: Int
    public let disabledScripts: Int
    public let totalBackups: Int
    public let extensionProtocolVersion: Int
    public let timestamp: Date

    public var formattedText: String {
        """
        === USERSCRIPT SYSTEM DIAGNOSTIC REPORT ===
        Date: \(ISO8601DateFormatter().string(from: timestamp))
        App Version: \(appVersion) (Build \(buildNumber))
        OS: \(osVersion)
        Device: \(deviceModel)
        
        [Storage Subsystem]
        Storage Type: \(storageType)
        Writable: \(storageWritable ? "YES" : "NO (Warning: Restricted)")
        Database Size: \(ByteCountFormatter.string(fromByteCount: storageSizeBytes, countStyle: .file))
        Available Backups: \(totalBackups)
        
        [Script Runtime]
        Total Installed: \(totalScripts)
        Active: \(activeScripts)
        Disabled: \(disabledScripts)
        Protocol Version: \(extensionProtocolVersion)
        
        Status: OPERATIONAL
        ===========================================
        """
    }
}

public final class DiagnosticService {
    public static func generateReport(scripts: [UserScript]) -> DiagnosticReport {
        let storageHealth = StorageManager.shared.checkHealth()
        
        let appVer = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        
        #if canImport(UIKit)
        let os = "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)"
        let model = UIDevice.current.model
        #else
        let os = "Apple Platform"
        let model = "Mac/Apple Device"
        #endif

        return DiagnosticReport(
            appVersion: appVer,
            buildNumber: build,
            osVersion: os,
            deviceModel: model,
            storageType: storageHealth.type.rawValue,
            storageWritable: storageHealth.isWritable,
            storageSizeBytes: storageHealth.databaseSizeBytes,
            totalScripts: scripts.count,
            activeScripts: scripts.filter { $0.enabled }.count,
            disabledScripts: scripts.filter { !$0.enabled }.count,
            totalBackups: storageHealth.backupCount,
            extensionProtocolVersion: 1,
            timestamp: Date()
        )
    }
}
