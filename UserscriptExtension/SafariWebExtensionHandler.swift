import SafariServices
import os.log

public final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let appGroupIdentifier = "group.com.userscript.app"

    public func beginRequest(with context: NSExtensionContext) {
        guard let item = context.inputItems.first as? NSExtensionItem,
              let message = item.userInfo?[SFExtensionMessageKey] as? [String: Any],
              let action = message["action"] as? String else {
            respond(to: context, with: ["status": "error", "message": "Invalid request"])
            return
        }

        switch action {
        case "getScripts":
            handleGetScripts(context: context)
        case "saveStorage":
            if let key = message["key"] as? String, let value = message["value"] {
                UserDefaults.standard.set(value, forKey: "gm_storage_\(key)")
                respond(to: context, with: ["status": "ok"])
            } else {
                respond(to: context, with: ["status": "error"])
            }
        case "getStorage":
            if let key = message["key"] as? String {
                let value = UserDefaults.standard.value(forKey: "gm_storage_\(key)")
                respond(to: context, with: ["status": "ok", "value": value as Any])
            } else {
                respond(to: context, with: ["status": "error"])
            }
        default:
            respond(to: context, with: ["status": "unknown_action"])
        }
    }

    private func handleGetScripts(context: NSExtensionContext) {
        let fileManager = FileManager.default
        let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
        let directoryURL = groupURL ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let fileURL = directoryURL.appendingPathComponent("userscripts.json")

        guard fileManager.fileExists(atPath: fileURL.path),
              let data = try? Data(contentsOf: fileURL),
              let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            respond(to: context, with: ["status": "ok", "scripts": []])
            return
        }

        // Return only enabled scripts
        let activeScripts = jsonArray.filter { ($0["enabled"] as? Bool) ?? true }
        respond(to: context, with: ["status": "ok", "scripts": activeScripts])
    }

    private func respond(to context: NSExtensionContext, with response: [String: Any]) {
        let responseItem = NSExtensionItem()
        responseItem.userInfo = [SFExtensionMessageKey: response]
        context.completeRequest(returningItems: [responseItem], completionHandler: nil)
    }
}
