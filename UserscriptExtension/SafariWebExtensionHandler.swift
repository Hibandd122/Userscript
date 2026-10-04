import SafariServices
import os.log

public final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let appGroupIdentifier = "group.com.userscript.app"
    public static let protocolVersion = 1

    public func beginRequest(with context: NSExtensionContext) {
        guard let item = context.inputItems.first as? NSExtensionItem,
              let message = item.userInfo?[SFExtensionMessageKey] as? [String: Any],
              let action = message["action"] as? String else {
            respond(to: context, with: [
                "status": "error",
                "code": "INVALID_REQUEST",
                "message": "Missing action or message"
            ])
            return
        }

        switch action {
        case "handshake":
            handleHandshake(context: context)
        case "getScripts":
            handleGetScripts(context: context)
        case "getScriptIndex":
            handleGetScriptIndex(context: context)
        case "saveStorage":
            handleSaveStorage(context: context, message: message)
        case "getStorage":
            handleGetStorage(context: context, message: message)
        case "reportExecution":
            handleReportExecution(context: context, message: message)
        default:
            respond(to: context, with: [
                "status": "error",
                "code": "UNKNOWN_ACTION",
                "action": action
            ])
        }
    }

    private func handleHandshake(context: NSExtensionContext) {
        respond(to: context, with: [
            "status": "ok",
            "protocolVersion": Self.protocolVersion,
            "capabilities": ["scripts", "index", "storage", "analytics", "corsProxy"]
        ])
    }

    private func handleGetScriptIndex(context: NSExtensionContext) {
        let fileManager = FileManager.default
        let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
        let dir = groupURL ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let indexFile = dir.appendingPathComponent("script_index.json")

        if fileManager.fileExists(atPath: indexFile.path),
           let data = try? Data(contentsOf: indexFile),
           let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            respond(to: context, with: ["status": "ok", "index": list])
            return
        }

        // Fallback to full scripts list if index isn't ready
        handleGetScripts(context: context)
    }

    private func handleGetScripts(context: NSExtensionContext) {
        let fileManager = FileManager.default
        let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
        let dir = groupURL ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let fileURL = dir.appendingPathComponent("userscripts.json")

        if fileManager.fileExists(atPath: fileURL.path),
           let data = try? Data(contentsOf: fileURL),
           let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            let activeScripts = jsonArray.filter { ($0["enabled"] as? Bool) ?? true }
            respond(to: context, with: ["status": "ok", "scripts": activeScripts])
            return
        }

        // Bundled fallback for instant sideload / offline support
        if let bundleURL = Bundle.main.url(forResource: "MangaUniversalPro.bundle.user", withExtension: "js"),
           let content = try? String(contentsOf: bundleURL, encoding: .utf8) {
            let scriptDict: [String: Any] = [
                "id": "manga-universal-pro",
                "name": "Manga Universal Pro (Offline Bundle)",
                "version": "3.0.0",
                "author": "Manga Pro Team",
                "enabled": true,
                "priority": 100,
                "runAt": "document-start",
                "matches": [
                    "*://*.mangadex.org/*",
                    "*://*.cuutruyen.net/*",
                    "*://*.truyenqq*.*/*",
                    "*://*.tvtruyen.*/*",
                    "*://*.nettruyen*.*/*",
                    "*://*.blogtruyen*.*/*",
                    "*://*.nhentai.net/*",
                    "*://*.nhentai.xxx/*",
                    "*://*.nhentai.to/*",
                    "*://*.hentaiz.*/*",
                    "*://hentaiz.*/*",
                    "*://*.rule34.xxx/*",
                    "*://rule34.xxx/*",
                    "*://*.rule34video.com/*",
                    "*://rule34video.com/*",
                    "*://*/*chapter*",
                    "*://*/*truyen*",
                    "*://*/*manga*"
                ],
                "grants": ["none"],
                "noframes": false,
                "content": content
            ]
            respond(to: context, with: ["status": "ok", "scripts": [scriptDict]])
            return
        }

        respond(to: context, with: ["status": "ok", "scripts": []])
    }

    private func handleSaveStorage(context: NSExtensionContext, message: [String: Any]) {
        guard let key = message["key"] as? String, let value = message["value"] else {
            respond(to: context, with: ["status": "error", "message": "Missing key or value"])
            return
        }
        UserDefaults.standard.set(value, forKey: "gm_storage_\(key)")
        respond(to: context, with: ["status": "ok"])
    }

    private func handleGetStorage(context: NSExtensionContext, message: [String: Any]) {
        guard let key = message["key"] as? String else {
            respond(to: context, with: ["status": "error", "message": "Missing storage key"])
            return
        }
        let val = UserDefaults.standard.value(forKey: "gm_storage_\(key)")
        respond(to: context, with: ["status": "ok", "value": val as Any])
    }

    private func handleReportExecution(context: NSExtensionContext, message: [String: Any]) {
        // Record script execution event for diagnostics
        if let scriptName = message["scriptName"] as? String {
            os_log("Userscript Executed: %{public}@", log: .default, type: .info, scriptName)
        }
        respond(to: context, with: ["status": "ok"])
    }

    private func respond(to context: NSExtensionContext, with response: [String: Any]) {
        let responseItem = NSExtensionItem()
        responseItem.userInfo = [SFExtensionMessageKey: response]
        context.completeRequest(returningItems: [responseItem], completionHandler: nil)
    }
}
