import SafariServices
import os.log

public final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let appGroupIdentifier = "group.com.userscript.app"
    public static let protocolVersion = 2

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
        case "addDomainRule":
            handleAddDomainRule(context: context, message: message)
        case "saveAppConfig":
            handleSaveAppConfig(context: context, message: message)
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
            "capabilities": ["scripts", "index", "storage", "analytics", "corsProxy", "domainRules", "appConfig"]
        ])
    }

    private func getTargetDirectory() -> URL {
        let fileManager = FileManager.default
        let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
        return groupURL ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    private func handleGetScriptIndex(context: NSExtensionContext) {
        let fileManager = FileManager.default
        let dir = getTargetDirectory()
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
        let dir = getTargetDirectory()
        let fileURL = dir.appendingPathComponent("userscripts.json")
        let domainRulesURL = dir.appendingPathComponent("domain_rules.json")
        let appConfigURL = dir.appendingPathComponent("app_config.json")

        var loadedDomainRules: [[String: Any]] = []
        if fileManager.fileExists(atPath: domainRulesURL.path),
           let dData = try? Data(contentsOf: domainRulesURL),
           let dArr = try? JSONSerialization.jsonObject(with: dData) as? [[String: Any]] {
            loadedDomainRules = dArr
        }

        var loadedAppConfig: [String: Any] = [:]
        if fileManager.fileExists(atPath: appConfigURL.path),
           let cData = try? Data(contentsOf: appConfigURL),
           let cDict = try? JSONSerialization.jsonObject(with: cData) as? [String: Any] {
            loadedAppConfig = cDict
        }

        if fileManager.fileExists(atPath: fileURL.path),
           let data = try? Data(contentsOf: fileURL),
           let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            let activeScripts = jsonArray.filter { ($0["enabled"] as? Bool) ?? true }
            respond(to: context, with: [
                "status": "ok",
                "scripts": activeScripts,
                "domainRules": loadedDomainRules,
                "appConfig": loadedAppConfig
            ])
            return
        }

        // Bundled fallback for instant sideload / offline support
        if let bundleURL = Bundle.main.url(forResource: "onluyen_get_all_questions.user", withExtension: "js"),
           let content = try? String(contentsOf: bundleURL, encoding: .utf8) {
            let scriptDict: [String: Any] = [
                "id": "onluyen-get-all-questions",
                "name": "OnLuyen · Lấy & Copy Toàn Bộ Câu Hỏi",
                "version": "4.0.0",
                "author": "Tris",
                "enabled": true,
                "priority": 100,
                "runAt": "document-idle",
                "matches": [
                    "https://app.onluyen.vn/*",
                    "*://app.onluyen.vn/*",
                    "*://*.onluyen.vn/*"
                ],
                "grants": [
                    "GM_xmlhttpRequest",
                    "GM_setClipboard",
                    "GM_setValue",
                    "GM_getValue"
                ],
                "noframes": false,
                "content": content
            ]
            respond(to: context, with: [
                "status": "ok",
                "scripts": [scriptDict],
                "domainRules": loadedDomainRules,
                "appConfig": loadedAppConfig
            ])
            return
        }

        respond(to: context, with: [
            "status": "ok",
            "scripts": [],
            "domainRules": loadedDomainRules,
            "appConfig": loadedAppConfig
        ])
    }

    private func handleAddDomainRule(context: NSExtensionContext, message: [String: Any]) {
        guard let domain = message["domain"] as? String,
              let action = message["action"] as? String else {
            respond(to: context, with: ["status": "error", "message": "Missing domain or action"])
            return
        }

        let dir = getTargetDirectory()
        let fileURL = dir.appendingPathComponent("domain_rules.json")
        var rules: [[String: Any]] = []

        if FileManager.default.fileExists(atPath: fileURL.path),
           let data = try? Data(contentsOf: fileURL),
           let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            rules = list
        }

        let newRule: [String: Any] = [
            "id": UUID().uuidString,
            "domainPattern": domain,
            "action": action,
            "createdAt": ISO8601DateFormatter().string(from: Date())
        ]
        rules.removeAll { ($0["domainPattern"] as? String) == domain }
        rules.append(newRule)

        if let encoded = try? JSONSerialization.data(withJSONObject: rules, options: [.prettyPrinted]) {
            try? encoded.write(to: fileURL)
        }

        respond(to: context, with: ["status": "ok"])
    }

    private func handleSaveAppConfig(context: NSExtensionContext, message: [String: Any]) {
        let dir = getTargetDirectory()
        let fileURL = dir.appendingPathComponent("app_config.json")
        if let encoded = try? JSONSerialization.data(withJSONObject: message, options: [.prettyPrinted]) {
            try? encoded.write(to: fileURL)
        }
        respond(to: context, with: ["status": "ok"])
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
